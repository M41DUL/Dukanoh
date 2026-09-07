-- RevenueCat webhook hardening — idempotency, atomic founder slots, and
-- founder cleanup when the expiry sweep is the one doing the downgrading.
--
-- Context: the founder tier logic was committed in cb3eb2c but never
-- deployed, so production has been writing every founder purchase as plain
-- 'pro'. Before deploying it, three things had to exist in the database.

-- ── 1. Event log / idempotency guard ─────────────────────────────────
--
-- RevenueCat retries on non-2xx and on timeout. Without this, a retried
-- INITIAL_PURCHASE re-runs the founder eligibility check, sees the slot
-- still unclaimed, and increments founder_count a second time.
--
-- Doubles as the audit trail for which environment an event came from —
-- pre-launch every purchase is SANDBOX, and those must never be mistaken
-- for real revenue.
CREATE TABLE IF NOT EXISTS public.revenuecat_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  app_user_id  UUID,
  environment  TEXT,
  product_id   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on with NO policies => default-deny for anon/authenticated. Only
-- service_role (BYPASSRLS) touches this table.
ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_user
  ON public.revenuecat_events (app_user_id, received_at DESC);

-- ── 2. Atomic founder slot claim ─────────────────────────────────────
--
-- The webhook previously did SELECT founder_count -> compute count+1 ->
-- UPDATE, which two concurrent purchases can interleave: both read N, both
-- write N+1, and the 150-slot cap overshoots. This takes a row lock so the
-- read-modify-write can't interleave.
--
-- Service-role only: auth.uid() is NULL under the service key, so there is
-- deliberately no identity guard here (see the wallet helpers for the same
-- pattern).
CREATE OR REPLACE FUNCTION public.claim_founder_slot(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_had   BOOLEAN;
  v_tier  TEXT;
  v_count INT;
  v_limit INT;
BEGIN
  -- Lock the member row first. release_founder_slot takes the same locks in
  -- the same order, so the two can't deadlock against each other.
  SELECT had_founder_subscription, seller_tier INTO v_had, v_tier
  FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Cancelled a founder sub before => never eligible again.
  IF v_had IS TRUE THEN RETURN FALSE; END IF;

  -- Already holding a slot. Happens on a duplicate INITIAL_PURCHASE that
  -- slipped past the event guard, or a re-purchase while still active.
  -- Report success so the caller still grants the tier, but don't take a
  -- second slot out of the 150.
  IF v_tier = 'founder' THEN RETURN TRUE; END IF;

  SELECT value::INT INTO v_count
  FROM public.platform_settings WHERE key = 'founder_count' FOR UPDATE;
  SELECT value::INT INTO v_limit
  FROM public.platform_settings WHERE key = 'founder_limit';

  IF v_count IS NULL OR v_limit IS NULL THEN RETURN FALSE; END IF;
  IF v_count >= v_limit          THEN RETURN FALSE; END IF;

  UPDATE public.platform_settings
     SET value = (v_count + 1)::TEXT
   WHERE key = 'founder_count';

  RETURN TRUE;
END;
$$;

REVOKE ALL   ON FUNCTION public.claim_founder_slot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_founder_slot(UUID) TO service_role;

-- ── 3. Atomic founder slot release ───────────────────────────────────
--
-- Idempotent by design: had_founder_subscription doubles as the "already
-- released" marker, so a retried EXPIRATION (or the expiry sweep running
-- after the webhook already handled it) can't decrement founder_count twice
-- and hand out phantom slots.
CREATE OR REPLACE FUNCTION public.release_founder_slot(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_had   BOOLEAN;
  v_count INT;
BEGIN
  SELECT had_founder_subscription INTO v_had
  FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_had IS TRUE THEN RETURN; END IF;   -- already released

  UPDATE public.users
     SET had_founder_subscription = TRUE
   WHERE id = p_user_id;

  SELECT value::INT INTO v_count
  FROM public.platform_settings WHERE key = 'founder_count' FOR UPDATE;

  IF v_count IS NOT NULL THEN
    UPDATE public.platform_settings
       SET value = GREATEST(0, v_count - 1)::TEXT
     WHERE key = 'founder_count';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.release_founder_slot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_founder_slot(UUID) TO service_role;

-- ── 4. Expiry sweep releases founder slots ───────────────────────────
--
-- The sweep is the backstop for a missed EXPIRATION webhook. It used to
-- downgrade expired founders to 'free' without releasing their slot, so
-- every missed webhook leaked one of the 150 permanently.
CREATE OR REPLACE FUNCTION public.expire_pro_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, seller_tier
    FROM public.users
    WHERE seller_tier IN ('pro', 'founder')
      AND pro_expires_at IS NOT NULL
      AND pro_expires_at < NOW()
  LOOP
    IF r.seller_tier = 'founder' THEN
      PERFORM public.release_founder_slot(r.id);
    END IF;

    UPDATE public.users SET seller_tier = 'free' WHERE id = r.id;
  END LOOP;
END;
$$;

-- ── 5. Keep the event log bounded ────────────────────────────────────
SELECT cron.schedule(
  'cleanup-old-revenuecat-events',
  '45 4 * * 0',
  $$DELETE FROM public.revenuecat_events WHERE received_at < now() - interval '90 days'$$
);
