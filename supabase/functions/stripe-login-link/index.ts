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
    .select('stripe_account_id')
    .eq('id', user_id)
    .single();

  const accountId = userRow?.stripe_account_id as string | null;
  if (!accountId) {
    return new Response(JSON.stringify({ error: 'No connected account found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const linkRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}/login_links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!linkRes.ok) {
    const err = await linkRes.json();
    return new Response(JSON.stringify({ error: err?.error?.message ?? 'Failed to generate login link' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const link = await linkRes.json();

  return new Response(JSON.stringify({ url: link.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
