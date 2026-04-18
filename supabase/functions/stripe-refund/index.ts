/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

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
  const callerId = user.id;

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

  // Verify the caller is either the buyer or an admin
  const isCallerBuyer = order.buyer_id === callerId;
  if (!isCallerBuyer) {
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'admin_user_ids')
      .single();
    const adminIds: string[] = JSON.parse(settings?.value ?? '[]');
    if (!adminIds.includes(callerId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const refundableStatuses = ['disputed', 'paid', 'created'];
  if (!refundableStatuses.includes(order.status)) {
    return new Response(JSON.stringify({ error: `Order cannot be refunded in status: ${order.status}` }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!order.stripe_payment_id) {
    return new Response(JSON.stringify({ refunded: false, reason: 'no_payment_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
