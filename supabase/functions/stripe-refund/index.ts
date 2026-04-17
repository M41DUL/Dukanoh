/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dukanoh-key',
      },
    });
  }

  const apiKey = Deno.env.get('INTERNAL_API_KEY');
  const providedKey = req.headers.get('x-dukanoh-key');
  if (!apiKey || !providedKey || !timingSafeEqual(providedKey, apiKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
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
    .select('id, stripe_payment_id, item_price, status')
    .eq('id', order_id)
    .single();

  if (!order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (order.status !== 'disputed') {
    return new Response(JSON.stringify({ error: 'Order is not in disputed status' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // No payment ID means the order was created without a payment (shouldn't happen
  // in production but guard against it gracefully)
  if (!order.stripe_payment_id) {
    return new Response(JSON.stringify({ refunded: false, reason: 'no_payment_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Refund item_price only — protection fee is non-refundable per policy
  const refundAmountPence = Math.round(order.item_price * 100);

  const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `dispute-refund-${order_id}`,
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
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
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
