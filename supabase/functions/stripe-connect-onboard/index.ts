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

  // Validate JWT and extract the calling user
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

  const { return_url, refresh_url } = await req.json().catch(() => ({}));

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: userRow } = await supabase
    .from('users')
    .select('stripe_account_id, stripe_onboarding_complete, first_name, last_name, phone, dob')
    .eq('id', userId)
    .single();

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? '';

  let accountId = userRow?.stripe_account_id as string | null;

  if (!accountId) {
    const createParams: Record<string, string> = {
      type: 'express',
      country: 'GB',
      email,
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'business_type': 'individual',
      'business_profile[url]': 'https://dukanoh.com',
      'business_profile[product_description]': 'South Asian clothing resale on Dukanoh marketplace',
      'business_profile[mcc]': '5691',
    };

    if (userRow?.first_name) createParams['individual[first_name]'] = userRow.first_name;
    if (userRow?.last_name)  createParams['individual[last_name]']  = userRow.last_name;
    if (userRow?.phone)      createParams['individual[phone]']      = userRow.phone;
    if (userRow?.dob) {
      const [y, m, d] = (userRow.dob as string).split('-');
      createParams['individual[dob][year]']  = y;
      createParams['individual[dob][month]'] = m;
      createParams['individual[dob][day]']   = d;
    }

    const createRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(createParams),
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

    await supabase
      .from('users')
      .update({ stripe_account_id: accountId })
      .eq('id', userId);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const linkBody = new URLSearchParams({
    account: accountId ?? '',
    'refresh_url': refresh_url ?? `${supabaseUrl}/functions/v1/stripe-connect-refresh`,
    'return_url': return_url ?? `${supabaseUrl}/functions/v1/stripe-connect-return`,
    type: 'account_onboarding',
    'collection_options[fields]': 'currently_due',
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
