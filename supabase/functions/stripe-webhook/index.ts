/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes — reject replays older than this

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

  return signatures.some(sig => sig === computedSig);
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
      .update({ status: 'paid', stripe_payment_id: pi.id, funds_available_on: fundsAvailableOn })
      .eq('listing_id', listing_id)
      .eq('buyer_id', buyer_id)
      .eq('status', 'pending')
      .select('id');

    if (confirmError) {
      // Genuine DB error — return 5xx so Stripe RETRIES (never swallow + 200).
      // eslint-disable-next-line no-console
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
        await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `orphan-refund-${pi.id}`,
          },
          body: new URLSearchParams({
            payment_intent: pi.id,
            'metadata[reason]': 'orphaned_payment_no_reservation',
          }),
        });
        // eslint-disable-next-line no-console
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

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
