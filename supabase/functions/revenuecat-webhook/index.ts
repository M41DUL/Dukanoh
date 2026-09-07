/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Events that mean the member has active Pro access
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

// Events where access continues until the expiry date (don't revoke yet).
// SUBSCRIPTION_PAUSED is Android-only: Play lets a member pause a sub, and
// access runs to the pause date. RevenueCat still sends EXPIRATION when
// access actually ends, so this only needs to move the expiry.
const CANCELLATION_EVENTS = new Set([
  'CANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Constant-time string compare. A plain `!==` on the shared secret leaks how
 * many leading bytes matched via response timing. Length is still leaked,
 * which is standard and acceptable.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!webhookSecret || !authHeader || !timingSafeEqual(authHeader, webhookSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const event = body?.event as Record<string, unknown> | undefined;
  if (!event) return json({ error: 'Invalid payload' }, 400);

  const eventId      = (event.id as string | undefined) ?? null;
  const eventType    = event.type as string;
  const userId       = (event.app_user_id as string | null) ?? null;
  const productId    = (event.product_id as string | null) ?? null;
  const environment  = (event.environment as string | undefined) ?? 'UNKNOWN';
  const expirationMs = event.expiration_at_ms as number | null;
  const expiresAt    = expirationMs ? new Date(expirationMs).toISOString() : null;

  // ── Environment gate ────────────────────────────────────────────────
  //
  // Sandbox / TestFlight / Play-internal / RevenueCat Test Store purchases
  // all reach this same endpoint and would otherwise grant real production
  // Pro — free, to anyone with a tester build — and eat real founder slots.
  //
  // Pre-launch, sandbox IS the only purchase channel, so this is env-gated
  // rather than hardcoded. Set ALLOW_SANDBOX_EVENTS=false on launch day.
  const allowSandbox = Deno.env.get('ALLOW_SANDBOX_EVENTS') === 'true';
  if (environment !== 'PRODUCTION' && !allowSandbox) {
    console.log(`Ignoring ${environment} event ${eventId ?? '(no id)'} (${eventType})`);
    // 200, not an error: received and deliberately not processed. A non-2xx
    // would make RevenueCat retry it forever.
    return json({ received: true, ignored: 'non-production' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ── Idempotency ─────────────────────────────────────────────────────
  //
  // RevenueCat retries on non-2xx and on timeout. The founder slot RPCs are
  // individually idempotent, but this stops duplicate work (and gives us the
  // audit trail of which environment each event came from).
  if (eventId) {
    const { error: dupeErr } = await supabase.from('revenuecat_events').insert({
      event_id:    eventId,
      event_type:  eventType,
      app_user_id: userId,
      environment,
      product_id:  productId,
    });
    if (dupeErr) {
      if (dupeErr.code === '23505') {
        return json({ received: true, duplicate: true });
      }
      console.error('Event log insert failed', dupeErr);
      return json({ error: 'Event log unavailable' }, 500);
    }
  }

  // Any DB failure below must surface as a 5xx so RevenueCat retries —
  // returning 200 on a failed write silently strands a paying member on the
  // free tier with no second chance.
  const check = (error: unknown, what: string) => {
    if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  };

  try {
    // ── TRANSFER ──────────────────────────────────────────────────────
    //
    // The subscription moved between app_user_ids. Handled before the
    // app_user_id guard below, because TRANSFER carries the ids in
    // transferred_from / transferred_to and may have no app_user_id at all.
    //
    // We revoke from the losing ids. Granting to the receiving id is left to
    // the RENEWAL/purchase event that follows, because TRANSFER doesn't
    // reliably carry an expiry — better a short gap than an unbounded grant.
    if (eventType === 'TRANSFER') {
      const from = (event.transferred_from as string[] | undefined) ?? [];
      for (const id of from) {
        const { data: row, error: readErr } = await supabase
          .from('users').select('seller_tier').eq('id', id).maybeSingle();
        check(readErr, 'transfer read');
        if (row?.seller_tier === 'founder') {
          const { error } = await supabase.rpc('release_founder_slot', { p_user_id: id });
          check(error, 'transfer release_founder_slot');
        }
        const { error } = await supabase
          .from('users')
          .update({ seller_tier: 'free', pro_expires_at: null })
          .eq('id', id);
        check(error, 'transfer downgrade');
      }
      return json({ received: true, transferred_from: from.length });
    }

    if (!userId) return json({ error: 'No user ID in event' }, 400);

    // Founder product ids differ per store — iOS uses a reverse-DNS bundle id
    // and Play uses `subscription:base_plan`. A single-value match would
    // silently treat one platform's founders as standard Pro, so this is a
    // comma-separated list.
    //
    // Deliberately NOT including the RevenueCat Test Store product: it shares
    // the identifier `monthly` with the standard Pro package, so it cannot
    // distinguish the tiers.
    const founderIds = (Deno.env.get('FOUNDER_PRODUCT_IDS') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const isFounderProduct = productId != null && founderIds.includes(productId);

    // Sandbox purchases may grant the founder TIER for testing, but must
    // never consume one of the 150 real slots.
    const mayClaimSlot = environment === 'PRODUCTION';

    if (ACTIVE_EVENTS.has(eventType)) {
      let tier: 'pro' | 'founder' = 'pro';

      if (isFounderProduct) {
        if (mayClaimSlot) {
          const { data: claimed, error } = await supabase
            .rpc('claim_founder_slot', { p_user_id: userId });
          check(error, 'claim_founder_slot');
          // Ineligible (previously cancelled, or the cap is full) => they
          // still get Pro, just at the standard tier.
          tier = claimed ? 'founder' : 'pro';
        } else {
          tier = 'founder';
        }
      }

      const update: Record<string, unknown> = {
        seller_tier: tier,
        pro_expires_at: expiresAt,
      };
      if (eventType === 'INITIAL_PURCHASE') update.had_free_trial = true;

      const { error } = await supabase.from('users').update(update).eq('id', userId);
      check(error, 'grant tier');

    } else if (EXPIRED_EVENTS.has(eventType)) {
      // Release the slot based on the tier we actually recorded, not on the
      // product id — a founder downgraded to 'pro' by a failed claim must not
      // release a slot they never held.
      const { data: row, error: readErr } = await supabase
        .from('users').select('seller_tier').eq('id', userId).maybeSingle();
      check(readErr, 'expire read');

      if (row?.seller_tier === 'founder') {
        const { error } = await supabase.rpc('release_founder_slot', { p_user_id: userId });
        check(error, 'release_founder_slot');
      }

      const { error } = await supabase
        .from('users')
        .update({ seller_tier: 'free', pro_expires_at: null })
        .eq('id', userId);
      check(error, 'revoke tier');

    } else if (CANCELLATION_EVENTS.has(eventType)) {
      // Access continues to the expiry date, so only the expiry moves here.
      //
      // Deliberately does NOT set had_founder_subscription yet, even though
      // the pre-deploy version did. That flag doubles as release_founder_slot's
      // "already released" marker, so setting it on cancellation would make
      // the later EXPIRATION skip the decrement and leak the slot forever.
      // Flagging happens at release time instead.
      //
      // Nothing is lost by waiting: a member who cancels and re-subscribes
      // while still active already holds their slot, and claim_founder_slot
      // returns true without taking a second one.
      const { error } = await supabase
        .from('users')
        .update({ pro_expires_at: expiresAt })
        .eq('id', userId);
      check(error, 'update expiry');
    }

    return json({ received: true });

  } catch (e) {
    console.error('revenuecat-webhook failed', e);
    // Drop the idempotency row so the retry can reprocess this event.
    if (eventId) {
      await supabase.from('revenuecat_events').delete().eq('event_id', eventId);
    }
    return json({ error: 'Processing failed' }, 500);
  }
});
