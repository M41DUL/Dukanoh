/* eslint-disable import/no-unresolved */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
/* eslint-enable import/no-unresolved */

// Orchestrates account deletion. See schema.sql account-deletion section
// for the full design rationale and flow.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

type FailureStep =
  | 'auth_ban'
  | 'identity_revoke'
  | 'stripe_close'
  | 'storage_cleanup';

const VALID_REASON_CODES = new Set([
  'not_finding',
  'bad_experience',
  'privacy',
  'notifications',
  'other',
]);

type DeletionBody = {
  reason_code?: string;
  reason_text?: string;
};

async function recordFailure(
  supabase: SupabaseClient,
  userId: string,
  step: FailureStep,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await supabase.from('deletion_failures').insert({
    user_id: userId,
    step,
    error: message.slice(0, 1000),
  });
}

async function stripeBlocker(accountId: string, stripeSecretKey: string) {
  // Check that no payout is on its way to the seller's bank. balance.retrieve
  // alone misses these — once a payout fires, the funds leave `available` but
  // can still bounce back if the bank rejects.
  const payoutsRes = await fetch(
    'https://api.stripe.com/v1/payouts?limit=1&status=pending',
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Stripe-Account': accountId,
      },
    },
  );
  if (payoutsRes.ok) {
    const payouts = await payoutsRes.json();
    if (Array.isArray(payouts.data) && payouts.data.length > 0) {
      return {
        kind: 'stripe_payout_pending',
        message: 'A payout to your bank account is in progress. Wait for it to clear before deleting.',
      };
    }
  }

  const transitRes = await fetch(
    'https://api.stripe.com/v1/payouts?limit=1&status=in_transit',
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Stripe-Account': accountId,
      },
    },
  );
  if (transitRes.ok) {
    const payouts = await transitRes.json();
    if (Array.isArray(payouts.data) && payouts.data.length > 0) {
      return {
        kind: 'stripe_payout_in_transit',
        message: 'A payout is in transit to your bank. Wait for it to settle before deleting.',
      };
    }
  }

  // Belt-and-braces: also check live Stripe balance in case the DB mirror
  // drifted from reality (e.g. if a recent webhook is delayed).
  const balanceRes = await fetch('https://api.stripe.com/v1/balance', {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Stripe-Account': accountId,
    },
  });
  if (balanceRes.ok) {
    const balance = await balanceRes.json();
    const sum = (arr: { amount: number }[]) =>
      Array.isArray(arr) ? arr.reduce((t, x) => t + (x.amount ?? 0), 0) : 0;
    if (sum(balance.pending) > 0 || sum(balance.available) > 0) {
      return {
        kind: 'stripe_balance',
        message: 'You have a remaining Stripe balance. Request a payout from your wallet before deleting.',
      };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? '';
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')         ?? '';

  // User-scoped client: passes the caller's JWT so RPCs see auth.uid().
  const authHeader   = req.headers.get('Authorization') ?? '';
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) {
    return json(401, { error: 'Unauthorized' });
  }
  const userId = user.id;

  // Optional anonymous feedback. Missing / invalid body is fine — the user
  // is allowed to skip the reason step.
  let body: DeletionBody = {};
  try {
    body = (await req.json()) as DeletionBody;
  } catch {
    body = {};
  }
  const reasonCode = body?.reason_code && VALID_REASON_CODES.has(body.reason_code)
    ? body.reason_code
    : null;
  const reasonText = typeof body?.reason_text === 'string'
    ? body.reason_text.slice(0, 500).trim() || null
    : null;

  // Service-role client: post-anonymize admin operations + failure logging.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Cache the Stripe account id BEFORE anonymize wipes it from user_private.
  const { data: userRow } = await supabase
    .from('user_private')
    .select('stripe_account_id')
    .eq('user_id', userId)
    .single();
  const stripeAccountId: string | null = userRow?.stripe_account_id ?? null;

  // 1. DB-side readiness check.
  const { data: readiness, error: readinessErr } =
    await supabaseAuth.rpc('check_deletion_readiness');
  if (readinessErr) {
    return json(500, { error: 'Readiness check failed', detail: readinessErr.message });
  }
  const dbBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  if (dbBlockers.length > 0) {
    return json(409, { error: 'BLOCKED', blockers: dbBlockers });
  }

  // 2. Stripe-side checks (the RPC can't see Stripe's internal payout state).
  if (stripeAccountId && STRIPE_SECRET_KEY) {
    const blocker = await stripeBlocker(stripeAccountId, STRIPE_SECRET_KEY);
    if (blocker) {
      return json(409, { error: 'BLOCKED', blockers: [blocker] });
    }
  }

  // 3. Record anonymous feedback (if the user picked a reason). Best-effort
  // — failures shouldn't block deletion. The row has no user_id so the
  // feedback survives anonymization without identifying anyone.
  if (reasonCode) {
    try {
      await supabase.from('deletion_feedback').insert({
        reason_code: reasonCode,
        reason_text: reasonText,
      });
    } catch {
      // Swallow — feedback is non-critical.
    }
  }

  // 4. Anonymize. Single transaction, re-runs guards under a row lock.
  // From here on, the user is anonymized from their POV. Any failure in
  // the post-steps is recorded but doesn't fail the request — the client
  // still completes the sign-out flow.
  const { data: anonResult, error: anonErr } =
    await supabaseAuth.rpc('anonymize_user_account');
  if (anonErr) {
    const msg = anonErr.message ?? '';
    // Race: state changed between readiness and the anonymize lock acquiring.
    // Surface the fresh blocker list so the client can update its UI.
    if (msg.includes('BLOCKED:')) {
      const { data: fresh } = await supabaseAuth.rpc('check_deletion_readiness');
      const blockers = Array.isArray(fresh?.blockers) ? fresh.blockers : [];
      return json(409, { error: 'BLOCKED', blockers });
    }
    return json(500, { error: 'Anonymize failed', detail: msg });
  }

  // 5. Scramble email (frees the original for re-signup) + 100-year ban.
  // Banning rotates refresh tokens; existing access tokens still work
  // until their natural expiry (~1h). The client signs out immediately
  // after a successful response which kills the local session.
  const scrambledEmail = `deleted_${userId.replace(/-/g, '')}@dukanoh.invalid`;
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email:         scrambledEmail,
      email_confirm: true,
      ban_duration:  '876000h',
      user_metadata: {},
      app_metadata:  { deleted_at: new Date().toISOString() },
    });
    if (error) throw error;
  } catch (e) {
    await recordFailure(supabase, userId, 'auth_ban', e);
  }

  // 6. Revoke linked identities so the original email + Apple/Google sub
  // become free to use for a brand-new signup later.
  try {
    const { data: getRes, error: getErr } = await supabase.auth.admin.getUserById(userId);
    if (getErr) throw getErr;
    const identities = getRes?.user?.identities ?? [];
    for (const identity of identities) {
      const identityId = (identity as { identity_id?: string }).identity_id;
      if (!identityId) continue;
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}/identities/${identityId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey:        SUPABASE_SERVICE_ROLE_KEY,
          },
        },
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`identity ${identityId}: HTTP ${res.status}`);
      }
    }
  } catch (e) {
    await recordFailure(supabase, userId, 'identity_revoke', e);
  }

  // 7. Close the Stripe Connect account. 404 is fine (already closed).
  if (stripeAccountId && STRIPE_SECRET_KEY) {
    try {
      const r = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (!r.ok && r.status !== 404) {
        const errBody = await r.text();
        throw new Error(`Stripe close HTTP ${r.status}: ${errBody.slice(0, 200)}`);
      }
    } catch (e) {
      await recordFailure(supabase, userId, 'stripe_close', e);
    }
  }

  // 8. Storage: avatar at avatars/<userId>.jpg. Listing images intentionally
  // stay — sold listings need them for dispute evidence, and product photos
  // aren't identifying once the seller row is anonymized.
  try {
    const { error } = await supabase.storage.from('avatars').remove([`${userId}.jpg`]);
    if (error) throw error;
  } catch (e) {
    await recordFailure(supabase, userId, 'storage_cleanup', e);
  }

  return json(200, {
    success:           true,
    already_deleted:   anonResult?.already_deleted === true,
    archived_listings: anonResult?.archived_listings ?? 0,
  });
});
