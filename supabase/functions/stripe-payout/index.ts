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

  const { user_id } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Fetch seller's Stripe account — wallet balance claimed atomically below
  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', user_id)
    .single();

  if (!userRow?.stripe_account_id || !userRow?.stripe_onboarding_complete) {
    return new Response(JSON.stringify({ error: 'Seller verification incomplete' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Atomically zero the balance and return how much was there.
  // Uses SELECT FOR UPDATE so concurrent requests block here — whichever
  // runs second sees 0 and exits early, preventing duplicate payouts.
  const { data: claimedAmount, error: claimError } = await supabase
    .rpc('claim_available_balance', { p_seller_id: user_id });

  if (claimError) {
    return new Response(JSON.stringify({ error: 'Failed to claim balance' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const availableBalance = claimedAmount as number ?? 0;
  if (availableBalance <= 0) {
    return new Response(JSON.stringify({ error: 'No funds available to withdraw' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const amountPence = Math.round(availableBalance * 100);

  // Trigger a payout on the connected account.
  // Balance is already zeroed — if this fails we restore it below.
  // Idempotency key includes the amount so a legitimate second withdrawal
  // (after balance is topped up again) gets a fresh key.
  const idempotencyKey = `payout-${user_id}-${amountPence}`;
  const payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': userRow.stripe_account_id,
      'Idempotency-Key': idempotencyKey,
    },
    body: new URLSearchParams({
      amount: String(amountPence),
      currency: 'gbp',
      'metadata[user_id]': user_id,
    }),
  });

  if (!payoutRes.ok) {
    const err = await payoutRes.json();

    // Restore the balance so the seller can try again
    await supabase
      .from('seller_wallet')
      .update({ available_balance: availableBalance })
      .eq('seller_id', user_id);

    return new Response(JSON.stringify({ error: err?.error?.message ?? 'Payout failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payout = await payoutRes.json();

  return new Response(
    JSON.stringify({ success: true, payout_id: payout.id, amount: availableBalance }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
