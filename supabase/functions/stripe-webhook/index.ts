/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */
import { walletToPaymentMethod } from '../_shared/paymentMethod.ts';

const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes — reject replays older than this

// Constant-time equality for equal-length hex strings — avoids leaking, via
// comparison timing, how much of a forged signature matched.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return false;

  // Reject stale events (replay attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(signedPayload)
  );

  const computedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some(sig => timingSafeEqualHex(sig, computedSig));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, stripe-signature',
      },
    });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signatureHeader = req.headers.get('stripe-signature');
  if (!signatureHeader) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Read raw body BEFORE parsing — signature is computed over exact bytes
  const rawBody = await req.text();

  const valid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const { listing_id, buyer_id, seller_id } = (pi.metadata ?? {}) as Record<string, string>;

    // Skip non-order payments (e.g. subscription charges carry no listing metadata)
    if (!listing_id || !buyer_id || !seller_id) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Capture when these funds clear in Stripe — drives the wallet's
    // pending→available release (release_cleared_wallet_funds). Best-effort: this
    // must NEVER block confirming the payment, so any failure falls back to a
    // conservative +7 days (the release also has a 14-day no-stranding net).
    let fundsAvailableOn: string;
    // How the buyer actually paid, read off the same charge. Recorded so the
    // order can still say "Paid with Google Pay" long after checkout, where
    // today only the success screen knows. Same best-effort footing as the
    // clear date: never worth failing a confirmed payment over.
    let paymentMethod: string | null = null;
    try {
      const sk = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
      const chargeId = (pi.latest_charge ?? pi.charges?.data?.[0]?.id) as string | undefined;
      let availableOnUnix: number | undefined;
      if (chargeId && sk) {
        const chRes = await fetch(
          `https://api.stripe.com/v1/charges/${chargeId}?expand[]=balance_transaction`,
          { headers: { Authorization: `Bearer ${sk}` } }
        );
        if (chRes.ok) {
          const ch = await chRes.json();
          availableOnUnix = ch?.balance_transaction?.available_on;
          paymentMethod = walletToPaymentMethod(ch?.payment_method_details?.card?.wallet?.type);
        }
      }
      fundsAvailableOn = availableOnUnix
        ? new Date(availableOnUnix * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } catch {
      fundsAvailableOn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    // Confirm the reservation created at checkout: flip the buyer's 'pending'
    // order → 'paid'. The order row (delivery address, fees) already exists from
    // create-payment-intent, so we only set status + the payment id. This UPDATE
    // is the single source of truth and the atomic claim for the payment.
    const { data: confirmed, error: confirmError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        stripe_payment_id: pi.id,
        funds_available_on: fundsAvailableOn,
        ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      })
      .eq('listing_id', listing_id)
      .eq('buyer_id', buyer_id)
      .eq('status', 'pending')
      .select('id');

    if (confirmError) {
      // Genuine DB error — return 5xx so Stripe RETRIES (never swallow + 200).
       
      console.error('order confirm failed', confirmError.message);
      return new Response(JSON.stringify({ error: 'confirm failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (confirmed && confirmed.length > 0) {
      // Reservation confirmed → mark listing sold (guarded so re-runs are safe).
      await supabase
        .from('listings')
        .update({ status: 'sold', buyer_id, sold_at: new Date().toISOString() })
        .eq('id', listing_id)
        .eq('status', 'available');
    } else {
      // No 'pending' reservation matched. Either a Stripe REDELIVERY of an
      // already-confirmed payment, or a genuine ORPHAN (reservation expired or
      // never existed). Refund ONLY a true orphan — never a paid order.
      const { data: alreadyRecorded } = await supabase
        .from('orders')
        .select('id')
        .eq('stripe_payment_id', pi.id)
        .maybeSingle();

      if (!alreadyRecorded) {
        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
        const orphanRefundBody: Record<string, string> = {
          payment_intent: pi.id,
          'metadata[reason]': 'orphaned_payment_no_reservation',
        };
        // If this orphan was a destination charge (verified seller), the money
        // already went to the seller — reverse it too so the platform isn't out.
        if (pi.transfer_data?.destination) {
          orphanRefundBody.reverse_transfer = 'true';
          orphanRefundBody.refund_application_fee = 'true';
        }
        await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `orphan-refund-${pi.id}`,
          },
          body: new URLSearchParams(orphanRefundBody),
        });
         
        console.error('orphaned payment auto-refunded (no reservation):', pi.id);
      }
      // else: redelivery of an already-recorded order → no-op.
    }
  }

  // A full refund was issued — either via Stripe Dashboard or a dispute resolved
  // in the buyer's favour. Cancel the order and relist the item.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentIntentId = charge.payment_intent as string | null;

    if (paymentIntentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Find the order — only act if it's still in an active state
      const { data: order } = await supabase
        .from('orders')
        .select('id, listing_id')
        .eq('stripe_payment_id', paymentIntentId)
        .in('status', ['paid', 'shipped'])
        .single();

      if (order) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'system',
          })
          .eq('id', order.id);

        if (order.listing_id) {
          await supabase
            .from('listings')
            .update({ status: 'available', buyer_id: null, sold_at: null })
            .eq('id', order.listing_id);
        }
      }
    }
  }

  // Bank chargeback opened — the buyer disputed the charge with their card issuer
  // (NOT the in-app dispute). Stripe has already withheld the funds from the
  // PLATFORM balance by the time this arrives, so there is no refund to issue.
  //
  // This handler deliberately MOVES NO MONEY. It records the chargeback and
  // leaves the decision to a person. Do not add a transfer reversal here without
  // reading the note below first.
  //
  // An earlier version reversed the seller's transfer, clawing the sale back out
  // of their Connect account so the liability landed on them rather than the
  // platform. That is the industry-standard outcome and it will probably be the
  // right one eventually, but it is not something we can do yet:
  //
  //   • The seller terms don't authorise it. Clause 8.2 permits recovery only
  //     "from funds held by Stripe that have not yet been released to the
  //     Seller", and explicitly concedes that once funds ARE released we cannot
  //     guarantee recovery. A reversal reaches past that limit.
  //   • Most sellers here are private individuals, so a clause letting us debit
  //     their balance is a consumer term and needs drafting to be enforceable.
  //   • Reversing without also decrementing seller_wallet leaves the wallet
  //     overstating what Stripe holds, and every future withdrawal fails.
  //
  // So: reversal stays out until the terms carry a chargeback/set-off clause and
  // the wallet decrement (plus a charge.dispute.closed handler to restore a
  // seller who WINS their dispute) ships alongside it. Until then the platform
  // absorbs chargebacks — visibly, which is the point of this handler.
  //
  // The order appears in the admin Health dashboard's "Bank chargebacks" section
  // as soon as chargeback_at is set. Requires the Stripe endpoint to be
  // subscribed to charge.dispute.created.
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const paymentIntentId = dispute.payment_intent as string | null;

    if (paymentIntentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: order } = await supabase
        .from('orders')
        .select('id, chargeback_at, total_paid')
        .eq('stripe_payment_id', paymentIntentId)
        .maybeSingle();

      if (order && !order.chargeback_at) {
        await supabase.from('orders').update({ chargeback_at: new Date().toISOString() }).eq('id', order.id);

        // Evidence is due back to the card issuer within days, and missing that
        // window loses the dispute by default — so this logs at error level with
        // everything needed to act on it.
        console.error(
          'CHARGEBACK opened — ACTION NEEDED. order:', order.id,
          'amount:', order.total_paid,
          'paymentIntent:', paymentIntentId,
          'dispute:', dispute.id,
          'reason:', dispute.reason,
          'evidenceDueBy:', dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
            : 'unknown',
          '— contest it in the Stripe Dashboard with the tracking number and delivery',
          'confirmation on the order, or accept the loss. The seller keeps their payout;',
          'the platform absorbs this until the terms allow a clawback.',
        );
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
