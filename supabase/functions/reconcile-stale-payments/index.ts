/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import { walletToPaymentMethod } from '../_shared/paymentMethod.ts';

// Called every 15 minutes by a pg_cron job (see the reconcile_stale_payments
// migration).
//
// WHY THIS EXISTS
// Checkout reserves a listing by inserting a 'pending' order BEFORE charging,
// then stripe-webhook flips it to 'paid'. cancel_stale_pending_orders() sweeps
// reservations older than 20 minutes so an abandoned checkout doesn't lock a
// listing forever — but plain SQL cannot tell "buyer walked away" from "buyer
// paid and the webhook hasn't arrived". Cancelling the latter loses a real sale:
// the order dies, the item goes back on sale, and the webhook — finding no
// pending reservation — auto-refunds the buyer as an orphaned payment. Money is
// returned, but a completed purchase silently evaporates for both sides.
//
// So the SQL sweep now only touches reservations that never reached Stripe
// (reserved_payment_intent_id IS NULL). Everything that DID reach Stripe comes
// here, where we can ask Stripe what actually happened and act on the answer.
//
// Conservative about payments in flight (processing, 3DS pending, authorised but
// uncaptured): those are left alone, because a listing locked for another 15
// minutes is recoverable and cancelling a payment about to succeed is not — but
// only up to MAX_HOLD_HOURS. See the in-flight branch for why an upper bound is
// mandatory now that the SQL sweep no longer backstops these rows.

const STALE_MINUTES = 20;

// Upper bound on how long a reservation may sit in an unresolved Stripe state
// before we try to release it. Long enough that no genuine payment flow is still
// running (3DS challenges expire in minutes), short enough that a listing isn't
// off the market for days.
const MAX_HOLD_HOURS = 24;

interface StaleOrder {
  id: string;
  listing_id: string | null;
  buyer_id: string | null;
  created_at: string;
  reserved_payment_intent_id: string;
}

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

  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: stale, error: staleError } = await supabase
    .from('orders')
    .select('id, listing_id, buyer_id, created_at, reserved_payment_intent_id')
    .eq('status', 'pending')
    .not('reserved_payment_intent_id', 'is', null)
    .lt('created_at', staleBefore);

  if (staleError) {
    console.error('reconcile: could not read stale reservations', staleError.message);
    return new Response(JSON.stringify({ error: 'query failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let confirmed = 0;
  let cancelled = 0;
  let inFlight = 0;
  let skipped = 0;

  // Cancel a reservation and put its listing back on the market.
  //
  // The order UPDATE is gated on the row still being 'pending', so an
  // overlapping run — or the webhook confirming mid-flight — can't be
  // overwritten. The listing is released ONLY when that update actually claimed
  // the row: releasing unconditionally would put a listing back on sale after
  // someone else's payment had already bought it, leaving them holding a paid
  // order for an item another member can now buy.
  async function cancelReservation(order: StaleOrder): Promise<boolean> {
    const { data: rows, error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'system',
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select('id');

    if (error || !rows || rows.length === 0) return false;

    if (order.listing_id) {
      await supabase
        .from('listings')
        .update({ status: 'available', buyer_id: null, sold_at: null })
        .eq('id', order.listing_id)
        .neq('status', 'available');
    }
    return true;
  }

  // Ask Stripe to cancel the PaymentIntent. Returns false when Stripe refuses,
  // which is exactly what we lean on: a PaymentIntent that has already succeeded
  // cannot be cancelled, so no real payment can ever be released via this path.
  async function cancelIntent(piId: string): Promise<boolean> {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ cancellation_reason: 'abandoned' }),
    });
    return res.ok;
  }

  for (const order of (stale ?? []) as StaleOrder[]) {
    const piId = order.reserved_payment_intent_id;

    // Expand the balance transaction so a confirmed payment gets the same real
    // clear date the webhook would have written, in one call.
    const piRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${piId}?expand[]=latest_charge.balance_transaction`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
    );

    if (!piRes.ok) {
      // 404 means the id never corresponded to a real PaymentIntent, so this
      // reservation cannot have been paid — safe to release. Any other failure
      // (rate limit, Stripe outage) tells us nothing; leave it for the next run.
      if (piRes.status === 404) {
        if (await cancelReservation(order)) cancelled++;
        else skipped++;
      } else {
        skipped++;
      }
      continue;
    }

    const pi = await piRes.json();

    if (pi.status === 'succeeded') {
      // The webhook never landed (or is still queued). Apply exactly what it
      // would have: confirm the reservation, then mark the listing sold. The
      // status filter keeps this idempotent if the webhook arrives mid-run —
      // whichever writes first wins and the other matches zero rows.
      const availableOnUnix = pi.latest_charge?.balance_transaction?.available_on as number | undefined;
      const fundsAvailableOn = availableOnUnix
        ? new Date(availableOnUnix * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: rows, error: confirmError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          stripe_payment_id: pi.id,
          funds_available_on: fundsAvailableOn,
          // Same derivation the webhook uses, so an order confirmed down this
          // path is indistinguishable from one confirmed normally.
          payment_method: walletToPaymentMethod(
            pi.latest_charge?.payment_method_details?.card?.wallet?.type
          ),
        })
        .eq('id', order.id)
        .eq('status', 'pending')
        .select('id');

      if (confirmError || !rows || rows.length === 0) {
        skipped++;
        continue;
      }

      await supabase
        .from('listings')
        .update({ status: 'sold', buyer_id: order.buyer_id, sold_at: new Date().toISOString() })
        .eq('id', order.listing_id ?? '')
        .eq('status', 'available');

      console.error('reconcile: confirmed a paid order the webhook missed', order.id, pi.id);
      confirmed++;
      continue;
    }

    if (pi.status === 'requires_payment_method' || pi.status === 'canceled') {
      // Buyer never completed, or the payment failed. Close the PaymentIntent
      // first so it can't succeed after we've put the listing back on sale; if
      // that fails, leave everything alone and re-evaluate next run rather than
      // relisting an item whose payment is still live.
      if (pi.status !== 'canceled' && !(await cancelIntent(piId))) {
        skipped++;
        continue;
      }
      if (await cancelReservation(order)) cancelled++;
      else skipped++;
      continue;
    }

    // processing / requires_action / requires_confirmation / requires_capture.
    // The money may yet land, so this is not ours to cancel on the normal
    // timeline. But the SQL sweep no longer backstops these rows, so without an
    // upper bound an abandoned 3DS challenge would lock its listing forever —
    // unbuyable by anyone (create-payment-intent 409s on the live reservation)
    // while still displayed as available. Past MAX_HOLD_HOURS, ask Stripe to
    // cancel: it refuses for anything already succeeded, so a genuine payment
    // survives and only a truly stuck reservation is released.
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (ageMs > MAX_HOLD_HOURS * 60 * 60 * 1000 && (await cancelIntent(piId))) {
      if (await cancelReservation(order)) {
        console.error('reconcile: released a reservation stuck in flight', order.id, pi.status);
        cancelled++;
        continue;
      }
    }

    console.error('reconcile: reservation still in flight', order.id, pi.status);
    inFlight++;
  }

  return new Response(
    JSON.stringify({ confirmed, cancelled, in_flight: inFlight, skipped }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
