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

  const userId    = event.app_user_id as string | null;
  const eventType = event.type as string;
  const productId = event.product_id as string | null;
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

  // Detect founder product via env var set at deploy time
  const founderProductId = Deno.env.get('FOUNDER_PRODUCT_ID') ?? '';
  const isFounderProduct = founderProductId !== '' && productId === founderProductId;

  if (ACTIVE_EVENTS.has(eventType)) {
    if (isFounderProduct && eventType === 'INITIAL_PURCHASE') {
      // Check eligibility: must not have cancelled a founder sub before, and slots must remain
      const [userRes, settingsRes] = await Promise.all([
        supabase.from('users').select('had_founder_subscription').eq('id', userId).maybeSingle(),
        supabase.from('platform_settings').select('key, value').in('key', ['founder_count', 'founder_limit']),
      ]);

      const hadFounderSub = userRes.data?.had_founder_subscription ?? false;
      const row = (k: string) => settingsRes.data?.find((r: { key: string }) => r.key === k)?.value;
      const founderCount = parseInt(row('founder_count') ?? '0', 10);
      const founderLimit = parseInt(row('founder_limit') ?? '150', 10);
      const slotsAvailable = founderCount < founderLimit;

      if (!hadFounderSub && slotsAvailable) {
        // Eligible — grant founder tier and increment count
        await Promise.all([
          supabase.from('users').update({
            seller_tier: 'founder',
            pro_expires_at: expiresAt,
            had_free_trial: true,
          }).eq('id', userId),
          supabase.from('platform_settings')
            .update({ value: String(founderCount + 1) })
            .eq('key', 'founder_count'),
        ]);
      } else {
        // Ineligible (previously cancelled founder OR cap reached) — treat as standard pro
        await supabase.from('users').update({
          seller_tier: 'pro',
          pro_expires_at: expiresAt,
          had_free_trial: true,
        }).eq('id', userId);
      }
    } else {
      // Standard pro purchase or non-initial founder event (renewal, uncancellation, product change)
      const update: Record<string, unknown> = {
        seller_tier: isFounderProduct ? 'founder' : 'pro',
        pro_expires_at: expiresAt,
      };
      if (eventType === 'INITIAL_PURCHASE') update.had_free_trial = true;
      await supabase.from('users').update(update).eq('id', userId);
    }
  } else if (EXPIRED_EVENTS.has(eventType)) {
    // Revoke Pro/Founder access immediately on expiry
    const updates: Record<string, unknown> = {
      seller_tier: 'free',
      pro_expires_at: null,
    };

    if (isFounderProduct) {
      // Permanently flag and decrement live count
      updates.had_founder_subscription = true;
      const { data: settingsData } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'founder_count')
        .maybeSingle();
      const currentCount = parseInt(settingsData?.value ?? '1', 10);
      await supabase.from('platform_settings')
        .update({ value: String(Math.max(0, currentCount - 1)) })
        .eq('key', 'founder_count');
    }

    await supabase.from('users').update(updates).eq('id', userId);
  } else if (CANCELLATION_EVENTS.has(eventType)) {
    // Access continues until expiry — update expiry and permanently flag founder cancellers
    const updates: Record<string, unknown> = { pro_expires_at: expiresAt };
    if (isFounderProduct) {
      // Flag immediately on cancellation so they can't re-subscribe at founder pricing
      // even while their current access is still active
      updates.had_founder_subscription = true;
    }
    await supabase.from('users').update(updates).eq('id', userId);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
