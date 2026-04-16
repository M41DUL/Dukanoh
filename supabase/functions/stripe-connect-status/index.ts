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

  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', user_id)
    .single();

  const accountId = userRow?.stripe_account_id as string | null;
  if (!accountId) {
    return new Response(JSON.stringify({ complete: false, charges_enabled: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Fetch account status from Stripe
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
  const wasAlreadyComplete = userRow?.stripe_onboarding_complete === true;

  // If newly complete, update the user record
  if (isComplete && !wasAlreadyComplete) {
    await supabase
      .from('users')
      .update({
        stripe_onboarding_complete: true,
        is_verified: true,
        is_seller: true,
      })
      .eq('id', user_id);

    // Create seller wallet row if it doesn't exist
    await supabase.from('seller_wallet').upsert(
      { seller_id: user_id, available_balance: 0, pending_balance: 0, lifetime_earned: 0 },
      { onConflict: 'seller_id', ignoreDuplicates: true }
    );

    // Find any paid orders for this seller where seller_verify_deadline is set
    // (i.e. orders placed before the seller was verified) and transfer the funds now
    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('id, item_price, stripe_payment_id')
      .eq('seller_id', user_id)
      .not('seller_verify_deadline', 'is', null)
      .in('status', ['paid', 'shipped']);

    for (const order of pendingOrders ?? []) {
      if (!order.stripe_payment_id) continue;

      const itemPricePence = Math.round(order.item_price * 100);

      // Transfer item price to seller's Connect account
      await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: String(itemPricePence),
          currency: 'gbp',
          destination: accountId,
          'metadata[order_id]': order.id,
          'metadata[payment_intent_id]': order.stripe_payment_id,
        }),
      });

      // Clear the deadline now that funds have been transferred
      await supabase
        .from('orders')
        .update({ seller_verify_deadline: null })
        .eq('id', order.id);
    }

    // Credit wallet with pending balance for those orders
    if ((pendingOrders ?? []).length > 0) {
      const totalPending = (pendingOrders ?? []).reduce((sum, o) => sum + o.item_price, 0);
      await supabase.rpc('increment_pending_balance', {
        p_seller_id: user_id,
        p_amount: totalPending,
      });
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
