/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// CORS: pin to the Dukanoh web origin (mobile + server-to-server callers don't
// use CORS, so this only constrains browser callers). Echoes the request Origin
// when it's in the allowlist, otherwise falls back to the apex domain.
const ALLOWED_ORIGINS = ['https://dukanoh.com', 'https://www.dukanoh.com'];
function corsOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin(req),
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
        'Vary': 'Origin',
      },
    });
  }

  // Two auth modes:
  //   1. Mobile app — buyer or admin user signed in via Supabase auth.
  //   2. Web admin (dukanoh-web) — no Supabase user; calls server-to-server
  //      with X-Admin-Token: STRIPE_REFUND_TOKEN. Treated as admin.
  const adminToken = req.headers.get('X-Admin-Token') ?? '';
  const adminSecret = Deno.env.get('STRIPE_REFUND_TOKEN') ?? '';
  const isWebAdmin = !!adminSecret && adminToken === adminSecret;

  let callerId: string | null = null;

  if (!isWebAdmin) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    callerId = user.id;
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { order_id } = await req.json();
  if (!order_id) {
    return new Response(JSON.stringify({ error: 'order_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: order } = await supabase
    .from('orders')
    .select('id, stripe_payment_id, item_price, total_paid, status, buyer_id, is_destination_charge')
    .eq('id', order_id)
    .single();

  if (!order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify the caller is either the buyer, an admin user, or the web admin.
  // Track whether the caller has admin privileges so we can gate which order
  // statuses they may refund (admins can refund 'disputed'; buyers cannot —
  // otherwise a buyer could raise a dispute and self-issue a refund while
  // keeping the item).
  let isCallerAdmin = false;
  let isCallerBuyer = false;

  if (isWebAdmin) {
    isCallerAdmin = true;
  } else {
    isCallerBuyer = order.buyer_id === callerId;
    if (!isCallerBuyer) {
      const { data: settings } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'admin_user_ids')
        .single();
      const adminIds: string[] = JSON.parse(settings?.value ?? '[]');
      if (!adminIds.includes(callerId!)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      isCallerAdmin = true;
    }
  }

  // Buyers can only refund their own paid/created orders (the cancel-before-
  // ship path). Disputed orders MUST go through admin adjudication — refunding
  // a disputed order is the seller-loses outcome of a resolved dispute.
  const refundableStatuses = isCallerAdmin
    ? ['disputed', 'paid', 'created']
    : ['paid', 'created'];
  if (!refundableStatuses.includes(order.status)) {
    return new Response(JSON.stringify({ error: `Order cannot be refunded in status: ${order.status}` }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!order.stripe_payment_id) {
    return new Response(JSON.stringify({ refunded: false, reason: 'no_payment_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req), 'Vary': 'Origin' },
    });
  }

  // stripe-refund is only ever called when the buyer should be made whole
  // (pre-ship cancellation or a buyer-favoured dispute), so we refund the FULL
  // amount including the protection fee — matching marketplace norms (Vinted /
  // eBay refund the buyer-protection fee on a successful claim). The platform
  // keeps its fee only on seller-wins, which never call this function.
  const refundAmountPence = Math.round(order.total_paid * 100);

  const refundBody: Record<string, string> = {
    payment_intent: order.stripe_payment_id,
    amount: String(refundAmountPence),
    'metadata[order_id]': order_id,
    'metadata[reason]': 'buyer_refund',
  };
  // For a destination charge the seller's cut already left to their Connect
  // account at charge time — reverse that transfer (and the application fee) so
  // the platform doesn't eat the loss. Omitted for platform-balance charges
  // (unverified-origin), where no transfer exists yet at refund time.
  if (order.is_destination_charge) {
    refundBody.reverse_transfer = 'true';
    refundBody.refund_application_fee = 'true';
  }

  const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Keyed on the order only: a given order is refunded at most once.
      'Idempotency-Key': `refund-${order_id}`,
    },
    body: new URLSearchParams(refundBody),
  });

  if (!refundRes.ok) {
    const err = await refundRes.json();
    return new Response(
      JSON.stringify({ error: err?.error?.message ?? 'Refund failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const refund = await refundRes.json();

  return new Response(
    JSON.stringify({ refunded: true, refund_id: refund.id, amount: order.total_paid }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req), 'Vary': 'Origin' },
    }
  );
});
