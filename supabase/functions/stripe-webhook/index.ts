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
    const {
      listing_id,
      buyer_id,
      seller_id,
      seller_verified,
      item_price_pence,
      protection_fee_pence,
    } = (pi.metadata ?? {}) as Record<string, string>;

    // Skip if not an order payment (e.g. a future subscription charge)
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

    // Fetch buyer's saved delivery address
    const { data: buyer } = await supabase
      .from('users')
      .select('address_line1, address_line2, city, postcode, country')
      .eq('id', buyer_id)
      .single();

    const itemPricePence = parseInt(item_price_pence ?? '0', 10);
    const protectionFeePence = parseInt(protection_fee_pence ?? '0', 10);
    const sellerVerifyDeadline =
      seller_verified === 'true'
        ? null
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Upsert order — idempotent via listing_id unique constraint.
    // If the client already created the row, ignoreDuplicates means we do nothing.
    await supabase.from('orders').upsert(
      {
        listing_id,
        buyer_id,
        seller_id,
        status: 'paid',
        item_price: itemPricePence / 100,
        protection_fee: protectionFeePence / 100,
        total_paid: (itemPricePence + protectionFeePence) / 100,
        stripe_payment_id: pi.id,
        seller_verify_deadline: sellerVerifyDeadline,
        delivery_address_line1: buyer?.address_line1 ?? null,
        delivery_address_line2: buyer?.address_line2 ?? null,
        delivery_city: buyer?.city ?? null,
        delivery_postcode: buyer?.postcode ?? null,
        delivery_country: buyer?.country ?? null,
      },
      { onConflict: 'listing_id', ignoreDuplicates: true }
    );

    // Mark listing as sold — guarded by status check so re-runs are safe
    await supabase
      .from('listings')
      .update({ status: 'sold', buyer_id, sold_at: new Date().toISOString() })
      .eq('id', listing_id)
      .eq('status', 'available');
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
