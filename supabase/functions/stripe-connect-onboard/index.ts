/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Constant-time string comparison to prevent timing attacks
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

  // Verify internal API key
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

  const { user_id, return_url, refresh_url } = await req.json();
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

  // Check if user already has a Connect account
  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', user_id)
    .single();

  // Fetch user email from auth
  const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
  const email = authUser?.user?.email ?? '';

  let accountId = userRow?.stripe_account_id as string | null;

  // Create a new Express account if needed
  if (!accountId) {
    const createRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'express',
        country: 'GB',
        email,
        'capabilities[card_payments][requested]': 'true',
        'capabilities[transfers][requested]': 'true',
        'business_type': 'individual',
        'business_profile[url]': 'https://dukanoh.com',
        'business_profile[product_description]': 'South Asian clothing resale on Dukanoh marketplace',
        'business_profile[mcc]': '5691',
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return new Response(JSON.stringify({ error: err?.error?.message ?? 'Failed to create account' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const account = await createRes.json();
    accountId = account.id;

    // Save the account ID to the user record
    await supabase
      .from('users')
      .update({ stripe_account_id: accountId })
      .eq('id', user_id);
  }

  // Generate an account link for onboarding
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const linkBody = new URLSearchParams({
    account: accountId ?? '',
    'refresh_url': refresh_url ?? `${supabaseUrl}/functions/v1/stripe-connect-refresh`,
    'return_url': return_url ?? `${supabaseUrl}/functions/v1/stripe-connect-return`,
    type: 'account_onboarding',
  });

  const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: linkBody,
  });

  if (!linkRes.ok) {
    const err = await linkRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message ?? 'Failed to create account link' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const link = await linkRes.json();

  return new Response(JSON.stringify({ url: link.url, account_id: accountId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
