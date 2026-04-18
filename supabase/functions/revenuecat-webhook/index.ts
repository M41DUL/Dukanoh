/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Events that mean the user has active Pro access
const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
]);

// Events that mean Pro access has ended
const EXPIRED_EVENTS = new Set([
  'EXPIRATION',
  'SUBSCRIBER_DELETED',
]);

// Events where access continues until expiry date (don't revoke immediately)
const CANCELLATION_EVENTS = new Set([
  'CANCELLATION',
  'BILLING_ISSUE',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Verify RevenueCat webhook secret
  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!webhookSecret || authHeader !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const event = body?.event;

  if (!event) {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = event.app_user_id as string | null;
  const eventType = event.type as string;
  const expirationMs = event.expiration_at_ms as number | null;
  const expiresAt = expirationMs ? new Date(expirationMs).toISOString() : null;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'No user ID in event' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (ACTIVE_EVENTS.has(eventType)) {
    const update: Record<string, unknown> = { seller_tier: 'pro', pro_expires_at: expiresAt };
    if (eventType === 'INITIAL_PURCHASE') update.had_free_trial = true;
    await supabase.from('users').update(update).eq('id', userId);
  } else if (EXPIRED_EVENTS.has(eventType)) {
    // Revoke Pro access immediately
    await supabase
      .from('users')
      .update({ seller_tier: 'free', pro_expires_at: null })
      .eq('id', userId);
  } else if (CANCELLATION_EVENTS.has(eventType)) {
    // User cancelled but keep access until expiry — just update the expiry date
    // The existing DB cron job handles revoking when pro_expires_at passes
    await supabase
      .from('users')
      .update({ pro_expires_at: expiresAt })
      .eq('id', userId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
