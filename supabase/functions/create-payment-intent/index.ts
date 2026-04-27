/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

function calcProtectionFeePence(itemPricePence: number, feePercent: number, feeFlatPence: number): number {
  return Math.round(itemPricePence * (feePercent / 100) + feeFlatPence);
}

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
  const buyerId = user.id;

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { listing_id } = await req.json();
  if (!listing_id) {
    return new Response(JSON.stringify({ error: 'listing_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const [{ data: listing }, { data: feeSettings }] = await Promise.all([
    supabase
      .from('listings')
      .select('id, price, status, seller_id')
      .eq('id', listing_id)
      .single(),
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['protection_fee_percent', 'protection_fee_flat']),
  ]);

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

  if (listing.seller_id === buyerId) {
    return new Response(JSON.stringify({ error: 'Cannot buy your own listing' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: seller } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', listing.seller_id)
    .single();

  const sellerVerified = !!(seller?.stripe_account_id && seller?.stripe_onboarding_complete);

  const feeRow = (k: string) => feeSettings?.find((r: { key: string; value: string }) => r.key === k)?.value;
  const feePercent = parseFloat(feeRow('protection_fee_percent') ?? '6.5');
  const feeFlatPence = Math.round(parseFloat(feeRow('protection_fee_flat') ?? '0.80') * 100);

  const itemPricePence = Math.round(listing.price * 100);
  const protectionFeePence = calcProtectionFeePence(itemPricePence, feePercent, feeFlatPence);
  const totalPence = itemPricePence + protectionFeePence;

  const piParams = new URLSearchParams({
    amount: String(totalPence),
    currency: 'gbp',
    'payment_method_types[]': 'card',
    'metadata[listing_id]': listing_id,
    'metadata[buyer_id]': buyerId,
    'metadata[seller_id]': listing.seller_id,
    'metadata[seller_verified]': String(sellerVerified),
    'metadata[item_price_pence]': String(itemPricePence),
    'metadata[protection_fee_pence]': String(protectionFeePence),
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
      'Idempotency-Key': `pi-${listing_id}-${buyerId}`,
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
