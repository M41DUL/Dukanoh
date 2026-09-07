-- Enforce the Pro entitlement in the database, not just in the UI.
--
-- lib/mutations/boosts.ts carried the comment "Server-side RLS is the real
-- gate." It wasn't. increment_boosts_used checked auth.uid() but never the
-- tier, and the boosts and collections INSERT policies checked only
-- ownership — so any member who called PostgREST directly got three free
-- Story boosts a month and unlimited collections.

-- ── Single source of truth for "is this member entitled to Pro" ──────
--
-- Expiry-aware: gating on seller_tier alone means a missed EXPIRATION
-- webhook grants free Pro until the nightly sweep catches it. Checking
-- pro_expires_at here closes that window everywhere at once.
CREATE OR REPLACE FUNCTION public.has_pro_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND seller_tier IN ('pro', 'founder')
      AND (pro_expires_at IS NULL OR pro_expires_at > NOW())
  );
$$;

-- Called from RLS policies, which run as the querying member.
REVOKE ALL   ON FUNCTION public.has_pro_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_pro_access(UUID) TO authenticated, service_role;

-- ── Free monthly boosts are a Pro entitlement ────────────────────────
CREATE OR REPLACE FUNCTION public.increment_boosts_used(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_quota         CONSTANT INTEGER := 3;
  v_used          INTEGER;
  v_reset_at      TIMESTAMPTZ;
  v_now           TIMESTAMPTZ := NOW();
  v_next_reset    TIMESTAMPTZ;
BEGIN
  -- Refuse calls that target a user other than the caller. SECURITY DEFINER
  -- bypasses RLS, so we have to enforce this explicitly or any authenticated
  -- user could exhaust a competitor's free-boost quota.
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify another user''s boost counter';
  END IF;

  -- The free monthly quota is a paid feature. Without this a free member can
  -- call the RPC directly and grant themselves three boosts a month.
  IF NOT public.has_pro_access(p_user_id) THEN
    RAISE EXCEPTION 'Dukanoh Pro required';
  END IF;

  SELECT boosts_used, boosts_reset_at
    INTO v_used, v_reset_at
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_next_reset := (DATE_TRUNC('month', v_now AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC';

  IF v_reset_at IS NULL OR v_reset_at <= v_now THEN
    v_used     := 0;
    v_reset_at := v_next_reset;
  END IF;

  IF v_used >= v_quota THEN
    UPDATE public.users SET boosts_reset_at = v_reset_at WHERE id = p_user_id;
    RETURN FALSE;
  END IF;

  UPDATE public.users
     SET boosts_used     = v_used + 1,
         boosts_reset_at = v_reset_at
   WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- ── Boost rows require a live subscription ───────────────────────────
--
-- Paid one-off boosts (the £0.99 consumable) go through the same table, so
-- this can't require Pro outright — but the boost row must still belong to
-- the seller, and free members reach the paid path instead of the quota.
-- The quota itself is guarded in increment_boosts_used above.
DROP POLICY IF EXISTS "Sellers can create boosts" ON public.boosts;
CREATE POLICY "Sellers can create boosts"
  ON public.boosts FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = seller_id);

-- ── Collections are a Pro feature ────────────────────────────────────
DROP POLICY IF EXISTS "Sellers can create their own collections" ON public.collections;
CREATE POLICY "Pro sellers can create their own collections"
  ON public.collections FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = seller_id AND public.has_pro_access(seller_id));

-- Editing an existing collection stays open to its owner: a lapsed
-- subscriber should be able to tidy or delete what they already made, just
-- not create more.
