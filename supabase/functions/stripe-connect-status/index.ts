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
    .from('user_private')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('user_id', userId)
    .single();

  const accountId = userRow?.stripe_account_id as string | null;
  if (!accountId) {
    return new Response(JSON.stringify({ complete: false, charges_enabled: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const stripeRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });

  if (!stripeRes.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch account' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const account = await stripeRes.json();
  const isComplete = account.charges_enabled === true && account.details_submitted === true;

  if (isComplete) {
    // stripe_onboarding_complete moved to user_private; the guard on its prior
    // value (false) makes this the idempotency gate for the whole block.
    const { data: updatedPrivate } = await supabase
      .from('user_private')
      .update({ stripe_onboarding_complete: true })
      .eq('user_id', userId)
      .eq('stripe_onboarding_complete', false)
      .select('user_id')
      .single();

    if (updatedPrivate) {
      // is_verified / is_seller stay on users — update only after the gate.
      await supabase
        .from('users')
        .update({ is_verified: true, is_seller: true })
        .eq('id', userId);

      await supabase.from('seller_wallet').upsert(
        { seller_id: userId, available_balance: 0, pending_balance: 0, lifetime_earned: 0 },
        { onConflict: 'seller_id', ignoreDuplicates: true }
      );

      // Catch-up settlement: pay out the seller for any of their unverified-origin
      // orders that have ALREADY COMPLETED while they were unverified. We settle
      // ONLY 'completed' orders — money is moved to the seller exactly when the
      // order is irreversibly theirs, so there is never a transfer to claw back on
      // a refund (refunds only happen pre-completion). Orders still in flight keep
      // their flag and are settled at completion by the auto-cancel-unverified-
      // orders maintenance cron. The wallet's available_balance was already
      // credited by the order-status trigger at completion — we do NOT touch the
      // wallet here (doing so double-counted against that trigger).
      const { data: claimedOrders } = await supabase
        .from('orders')
        .update({ seller_verify_deadline: null })
        .eq('seller_id', userId)
        .not('seller_verify_deadline', 'is', null)
        .eq('status', 'completed')
        .select('id, item_price, stripe_payment_id');

      for (const order of claimedOrders ?? []) {
        if (!order.stripe_payment_id) continue;
        const itemPricePence = Math.round(order.item_price * 100);
        await fetch('https://api.stripe.com/v1/transfers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            // Idempotent across the verify catch-up AND the maintenance cron —
            // whichever runs first wins, the other is a no-op for this order.
            'Idempotency-Key': `transfer-${order.id}`,
          },
          body: new URLSearchParams({
            amount: String(itemPricePence),
            currency: 'gbp',
            destination: accountId,
            'metadata[order_id]': order.id,
            'metadata[payment_intent_id]': order.stripe_payment_id,
          }),
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      complete: isComplete,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
