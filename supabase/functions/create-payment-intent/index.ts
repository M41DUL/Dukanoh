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

/** Buyer protection fee: 6.5% of item price + £0.80 flat, in pence */
function calcProtectionFeePence(itemPricePence: number): number {
  return Math.round(itemPricePence * 0.065 + 80);
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

  const { listing_id, buyer_id } = await req.json();
  if (!listing_id || !buyer_id) {
    return new Response(JSON.stringify({ error: 'listing_id and buyer_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Fetch listing
  const { data: listing } = await supabase
    .from('listings')
    .select('id, price, status, seller_id')
    .eq('id', listing_id)
    .single();

  if (!listing) {
    return new Response(JSON.stringify({ error: 'Listing not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (listing.status !== 'available') {
    return new Response(JSON.stringify({ error: 'Listing is no longer available' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (listing.seller_id === buyer_id) {
    return new Response(JSON.stringify({ error: 'Cannot buy your own listing' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch seller — check if they're verified
  const { data: seller } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', listing.seller_id)
    .single();

  const sellerVerified = !!(seller?.stripe_account_id && seller?.stripe_onboarding_complete);

  // Calculate amounts in pence
  const itemPricePence = Math.round(listing.price * 100);
  const protectionFeePence = calcProtectionFeePence(itemPricePence);
  const totalPence = itemPricePence + protectionFeePence;

  // Build PaymentIntent params.
  // If seller is verified: transfer directly to their Connect account.
  // If not verified: payment stays on platform account; we hold it until they verify.
  const piParams = new URLSearchParams({
    amount: String(totalPence),
    currency: 'gbp',
    'payment_method_types[]': 'card',
    'metadata[listing_id]': listing_id,
    'metadata[buyer_id]': buyer_id,
    'metadata[seller_id]': listing.seller_id,
    'metadata[seller_verified]': String(sellerVerified),
  });

  if (sellerVerified) {
    piParams.set('transfer_data[destination]', seller?.stripe_account_id ?? '');
    piParams.set('application_fee_amount', String(protectionFeePence));
  }

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: piParams,
  });

  if (!piRes.ok) {
    const err = await piRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message ?? 'Failed to create payment intent' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pi = await piRes.json();

  return new Response(
    JSON.stringify({
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      amount: totalPence,
      item_price: itemPricePence,
      protection_fee: protectionFeePence,
      seller_verified: sellerVerified,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
