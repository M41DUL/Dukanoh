/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// This function is called daily by a pg_cron job via a database webhook.
// It finds orders where the seller's 7-day verification deadline has passed,
// cancels them, refunds the buyer via Stripe, and relists the item.

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Find all orders past their seller verification deadline
  const { data: expiredOrders } = await supabase
    .from('orders')
    .select('id, listing_id, seller_id, stripe_payment_id, total_paid')
    .not('seller_verify_deadline', 'is', null)
    .lt('seller_verify_deadline', new Date().toISOString())
    .in('status', ['paid', 'shipped']);

  if (!expiredOrders || expiredOrders.length === 0) {
    return new Response(JSON.stringify({ cancelled: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let cancelledCount = 0;

  for (const order of expiredOrders) {
    // Refund the buyer via Stripe
    if (order.stripe_payment_id) {
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `refund-${order.id}`,
        },
        body: new URLSearchParams({
          payment_intent: order.stripe_payment_id,
          'metadata[order_id]': order.id,
          'metadata[reason]': 'seller_verification_timeout',
        }),
      });

      if (!refundRes.ok) {
        // Skip this order — refund failed, leave for next run
        continue;
      }
    }

    // Cancel the order
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'system',
        seller_verify_deadline: null,
      })
      .eq('id', order.id);

    // Relist the item
    if (order.listing_id) {
      await supabase
        .from('listings')
        .update({ status: 'available', buyer_id: null, sold_at: null })
        .eq('id', order.listing_id);
    }

    cancelledCount++;
  }

  return new Response(JSON.stringify({ cancelled: cancelledCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
