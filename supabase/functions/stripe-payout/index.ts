/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

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
  const userId = user.id;

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

  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', userId)
    .single();

  if (!userRow?.stripe_account_id || !userRow?.stripe_onboarding_complete) {
    return new Response(JSON.stringify({ error: 'Seller verification incomplete' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: claimedAmount, error: claimError } = await supabase
    .rpc('claim_available_balance', { p_seller_id: userId });

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
  const idempotencyKey = `payout-${userId}-${amountPence}`;

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
      'metadata[user_id]': userId,
    }),
  });

  if (!payoutRes.ok) {
    const err = await payoutRes.json();
    await supabase.rpc('restore_available_balance', { p_seller_id: userId, p_amount: availableBalance });

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
