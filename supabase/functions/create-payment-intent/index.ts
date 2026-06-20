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
    .from('user_private')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('user_id', listing.seller_id)
    .single();

  const sellerVerified = !!(seller?.stripe_account_id && seller?.stripe_onboarding_complete);

  // Block checkout for unverified sellers BEFORE creating any charge — there is
  // no Stripe Connect account to route the money to, so a buyer must never be
  // charged for their item. The app already shows a "Seller not verified" alert
  // for this exact error string.
  if (!sellerVerified) {
    return new Response(JSON.stringify({ error: 'Seller has not completed verification' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const feeRow = (k: string) => feeSettings?.find((r: { key: string; value: string }) => r.key === k)?.value;
  const feePercent = parseFloat(feeRow('protection_fee_percent') ?? '6.5');
  const feeFlatPence = Math.round(parseFloat(feeRow('protection_fee_flat') ?? '0.80') * 100);

  const itemPricePence = Math.round(listing.price * 100);
  const protectionFeePence = calcProtectionFeePence(itemPricePence, feePercent, feeFlatPence);
  const totalPence = itemPricePence + protectionFeePence;

  // Reserve the listing with a short-lived 'pending' order BEFORE charging.
  // The partial unique index on (listing_id) WHERE status <> 'cancelled' makes
  // this atomic: a second concurrent buyer's insert fails here, so only one
  // buyer can ever reach a charge for a given listing.
  const { data: buyerAddr } = await supabase
    .from('user_private')
    .select('address_line1, address_line2, city, postcode, country')
    .eq('user_id', buyerId)
    .single();

  let orderId: string;
  const { data: reserved, error: reserveError } = await supabase
    .from('orders')
    .insert({
      listing_id,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      status: 'pending',
      item_price: itemPricePence / 100,
      protection_fee: protectionFeePence / 100,
      total_paid: totalPence / 100,
      seller_verify_deadline: null,
      delivery_address_line1: buyerAddr?.address_line1 ?? null,
      delivery_address_line2: buyerAddr?.address_line2 ?? null,
      delivery_city: buyerAddr?.city ?? null,
      delivery_postcode: buyerAddr?.postcode ?? null,
      delivery_country: buyerAddr?.country ?? null,
    })
    .select('id')
    .single();

  if (reserveError) {
    // 23505 = an active (non-cancelled) order already exists for this listing.
    if (reserveError.code === '23505') {
      const { data: existing } = await supabase
        .from('orders')
        .select('id, buyer_id, status')
        .eq('listing_id', listing_id)
        .neq('status', 'cancelled')
        .single();
      // Same buyer resuming their own in-progress checkout → reuse it (the stable
      // idempotency key returns the same PaymentIntent). Anyone else → it's taken.
      if (existing && existing.buyer_id === buyerId) {
        orderId = existing.id;
      } else {
        return new Response(JSON.stringify({ error: 'Listing is no longer available' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Could not start checkout. Please try again.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    orderId = reserved!.id;
  }

  const piParams = new URLSearchParams({
    amount: String(totalPence),
    currency: 'gbp',
    // Restrict to card only — no Link / Klarna / Amazon Pay / Revolut Pay in
    // the PaymentSheet. Apple Pay / Google Pay are unaffected (they use the
    // dedicated PlatformPay sheet, not the PaymentSheet method list).
    'payment_method_types[]': 'card',
    'metadata[listing_id]': listing_id,
    'metadata[buyer_id]': buyerId,
    'metadata[seller_id]': listing.seller_id,
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
      // Keyed on the reservation (order id): a re-attempt after a stale
      // reservation was cleaned up gets a fresh PaymentIntent, while a buyer
      // resuming the same reservation reuses the same PI.
      'Idempotency-Key': `pi-v3-${orderId}`,
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
      order_id: orderId,
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
