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

  const now = new Date().toISOString();

  async function cancelAndRefund(
    order: { id: string; listing_id: string | null; seller_id: string | null; stripe_payment_id: string | null; total_paid: number },
    reason: string,
    clearField: Record<string, null>,
  ): Promise<boolean> {
    if (order.stripe_payment_id) {
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `refund-${order.id}-${reason}`,
        },
        body: new URLSearchParams({
          payment_intent: order.stripe_payment_id,
          'metadata[order_id]': order.id,
          'metadata[reason]': reason,
        }),
      });
      if (!refundRes.ok) return false;
    }

    await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: 'system', ...clearField })
      .eq('id', order.id);

    if (order.listing_id) {
      await supabase
        .from('listings')
        .update({ status: 'available', buyer_id: null, sold_at: null })
        .eq('id', order.listing_id);
    }

    if (order.seller_id) {
      await supabase
        .from('cancellation_strikes')
        .insert({ seller_id: order.seller_id, order_id: order.id });
    }

    return true;
  }

  let cancelledCount = 0;

  // 1. Seller verification timeout
  const { data: unverifiedOrders } = await supabase
    .from('orders')
    .select('id, listing_id, seller_id, stripe_payment_id, total_paid')
    .not('seller_verify_deadline', 'is', null)
    .lt('seller_verify_deadline', now)
    .in('status', ['paid', 'shipped']);

  for (const order of unverifiedOrders ?? []) {
    const ok = await cancelAndRefund(order, 'seller_verification_timeout', { seller_verify_deadline: null });
    if (ok) cancelledCount++;
  }

  // 2. Dispatch deadline expired — seller did not ship within 5 days of payment
  const { data: undispatchedOrders } = await supabase
    .from('orders')
    .select('id, listing_id, seller_id, stripe_payment_id, total_paid')
    .not('dispatch_deadline_at', 'is', null)
    .lt('dispatch_deadline_at', now)
    .eq('status', 'paid');

  for (const order of undispatchedOrders ?? []) {
    const ok = await cancelAndRefund(order, 'dispatch_deadline_expired', { dispatch_deadline_at: null });
    if (ok) cancelledCount++;
  }

  return new Response(JSON.stringify({ cancelled: cancelledCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
