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
    const { data: updatedUser } = await supabase
      .from('users')
      .update({ stripe_onboarding_complete: true, is_verified: true, is_seller: true })
      .eq('id', userId)
      .eq('stripe_onboarding_complete', false)
      .select('id')
      .single();

    if (updatedUser) {
      await supabase.from('seller_wallet').upsert(
        { seller_id: userId, available_balance: 0, pending_balance: 0, lifetime_earned: 0 },
        { onConflict: 'seller_id', ignoreDuplicates: true }
      );

      const { data: claimedOrders } = await supabase
        .from('orders')
        .update({ seller_verify_deadline: null })
        .eq('seller_id', userId)
        .not('seller_verify_deadline', 'is', null)
        .in('status', ['paid', 'shipped'])
        .select('id, item_price, stripe_payment_id');

      for (const order of claimedOrders ?? []) {
        if (!order.stripe_payment_id) continue;
        const itemPricePence = Math.round(order.item_price * 100);
        await fetch('https://api.stripe.com/v1/transfers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
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

      if ((claimedOrders ?? []).length > 0) {
        const totalPending = (claimedOrders ?? []).reduce((sum, o) => sum + o.item_price, 0);
        await supabase.rpc('increment_pending_balance', {
          p_seller_id: userId,
          p_amount: totalPending,
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
