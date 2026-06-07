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
    .select('id, stripe_payment_id, item_price, status, buyer_id')
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

  const refundAmountPence = Math.round(order.item_price * 100);

  const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `refund-${order.status}-${order_id}`,
    },
    body: new URLSearchParams({
      payment_intent: order.stripe_payment_id,
      amount: String(refundAmountPence),
      'metadata[order_id]': order_id,
      'metadata[reason]': 'dispute_resolved_for_buyer',
    }),
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
    JSON.stringify({ refunded: true, refund_id: refund.id, amount: order.item_price }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req), 'Vary': 'Origin' },
    }
  );
});
