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

  if (!userRow?.stripe_account_id || !userRow?.stripe_onboarding_complete) {
    return new Response(JSON.stringify({ error: 'Seller verification incomplete' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accountId = userRow.stripe_account_id;

  // Just-in-time settlement. Unverified-origin orders are charged to the PLATFORM
  // balance and flagged (seller_verify_deadline); their money only reaches the
  // seller's Connect account once settled. The maintenance cron settles these in
  // the background, but we also settle here — synchronously, right before paying
  // out — so a seller is never told their balance is withdrawable while the funds
  // aren't yet in their Connect account (which would make the payout below fail).
  // We settle ONLY 'completed' orders (irreversibly the seller's, so no clawback
  // is ever needed). Idempotent with the cron + verify catch-up via the shared
  // transfer key; the flag is cleared only once the money has actually moved.
  const { data: heldOrders } = await supabase
    .from('orders')
    .select('id, item_price, stripe_payment_id')
    .eq('seller_id', userId)
    .eq('status', 'completed')
    .not('seller_verify_deadline', 'is', null);

  for (const order of heldOrders ?? []) {
    if (!order.stripe_payment_id) continue;
    const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `transfer-${order.id}`,
      },
      body: new URLSearchParams({
        amount: String(Math.round(order.item_price * 100)),
        currency: 'gbp',
        destination: accountId,
        'metadata[order_id]': order.id,
        'metadata[payment_intent_id]': order.stripe_payment_id,
      }),
    });
    if (transferRes.ok) {
      await supabase
        .from('orders')
        .update({ seller_verify_deadline: null })
        .eq('id', order.id);
    }
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
  // Unique per withdrawal. A key of just user+amount collided across two
  // legitimate same-amount withdrawals within Stripe's 24h idempotency window —
  // the second returned the cached first payout (no money sent) while the wallet
  // had already been claimed, stranding the funds. The claim_available_balance
  // FOR UPDATE lock (above) is what prevents double-submit double-payout, so a
  // fresh key here is safe and fixes the collision.
  const idempotencyKey = `payout-${userId}-${amountPence}-${crypto.randomUUID()}`;

  let payoutRes: Response;
  try {
    payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
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
  } catch {
    // Network-level throw: we genuinely DON'T know whether Stripe created the
    // payout. We must NOT auto-restore — a retry would re-claim and (with the
    // unique idempotency key) could create a SECOND payout if the first had
    // actually succeeded. Leave the balance claimed and surface for manual
    // reconciliation rather than risk a double-payout. (A returned error status,
    // below, is unambiguous — Stripe did not pay — so that path DOES restore.)
    // eslint-disable-next-line no-console
    console.error('PAYOUT network failure — balance left claimed, needs manual reconciliation. user:', userId, 'amountPence:', amountPence);
    return new Response(
      JSON.stringify({ error: "We couldn't reach the payment processor. If your balance looks wrong, contact support — we'll sort it out." }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

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
