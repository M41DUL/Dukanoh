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
    order: { id: string; listing_id: string | null; seller_id: string | null; stripe_payment_id: string | null; total_paid: number; is_destination_charge?: boolean },
    reason: string,
    clearField: Record<string, null>,
  ): Promise<boolean> {
    if (order.stripe_payment_id) {
      const refundBody: Record<string, string> = {
        payment_intent: order.stripe_payment_id,
        'metadata[order_id]': order.id,
        'metadata[reason]': reason,
      };
      // Destination charge -> the seller already has the money; reverse it.
      if (order.is_destination_charge) {
        refundBody.reverse_transfer = 'true';
        refundBody.refund_application_fee = 'true';
      }
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `refund-${order.id}-${reason}`,
        },
        body: new URLSearchParams(refundBody),
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

  // Dispatch deadline expired — seller did not ship within 5 days of payment
  const { data: undispatchedOrders } = await supabase
    .from('orders')
    .select('id, listing_id, seller_id, stripe_payment_id, total_paid, is_destination_charge')
    .not('dispatch_deadline_at', 'is', null)
    .lt('dispatch_deadline_at', now)
    .eq('status', 'paid');

  for (const order of undispatchedOrders ?? []) {
    const ok = await cancelAndRefund(order, 'dispatch_deadline_expired', { dispatch_deadline_at: null });
    if (ok) cancelledCount++;
  }

  // ── Settlement: pay verified sellers for their completed unverified-origin
  // orders ─────────────────────────────────────────────────────────────────
  // An unverified seller can sell and ship; their money is held on the platform
  // (flagged with seller_verify_deadline) until the order COMPLETES and they
  // verify. We settle only 'completed' orders, so there is never a transfer to
  // reverse on a refund. Money moves platform → seller's Connect account; the
  // wallet's available_balance was already credited by the order-status trigger
  // at completion, so we only clear the flag here (no wallet write).
  let settledCount = 0;
  const { data: settleable } = await supabase
    .from('orders')
    .select('id, item_price, stripe_payment_id, seller_id')
    .eq('status', 'completed')
    .not('seller_verify_deadline', 'is', null);

  if (settleable && settleable.length > 0) {
    const sellerIds = [...new Set(settleable.map(o => o.seller_id).filter(Boolean))];
    const { data: sellers } = await supabase
      .from('user_private')
      .select('user_id, stripe_account_id, stripe_onboarding_complete')
      .in('user_id', sellerIds);

    const verifiedAccount = new Map<string, string>();
    for (const s of sellers ?? []) {
      if (s.stripe_account_id && s.stripe_onboarding_complete) {
        verifiedAccount.set(s.user_id, s.stripe_account_id);
      }
    }

    for (const order of settleable) {
      const accountId = order.seller_id ? verifiedAccount.get(order.seller_id) : undefined;
      // Seller not verified yet → leave the flag set; settle on a later run once
      // they verify (or it's picked up immediately by stripe-connect-status).
      if (!accountId || !order.stripe_payment_id) continue;

      const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          // Same key as the stripe-connect-status catch-up — settling an order
          // twice is a no-op.
          'Idempotency-Key': `transfer-${order.id}`,
        },
        body: new URLSearchParams({
          amount: String(Math.round(order.item_price * 100)),
          currency: 'gbp',
          destination: accountId,
          'metadata[order_id]': order.id,
          'metadata[payment_intent_id]': order.stripe_payment_id,
        }),
      });

      // Only clear the flag once the money has actually moved, so a failed
      // transfer is retried on the next run rather than silently dropped.
      if (transferRes.ok) {
        await supabase
          .from('orders')
          .update({ seller_verify_deadline: null })
          .eq('id', order.id);
        settledCount++;
      }
    }
  }

  return new Response(JSON.stringify({ cancelled: cancelledCount, settled: settledCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
