-- Harden SECURITY DEFINER RPCs so callers can't forge identity, and lock down
-- functions that should only ever run server-side (edge functions / cron).
--
-- WHY: in Postgres, CREATE FUNCTION grants EXECUTE to PUBLIC by default, so every
-- RPC below was reachable directly via PostgREST by the anon/authenticated roles.
-- The money/order functions trusted a caller-supplied id (p_seller_id / p_buyer_id
-- / p_user_id) instead of auth.uid(), so a forged id let anyone touch another
-- user's wallet or orders. Edge-only helpers run with the service-role key, where
-- auth.uid() is NULL, so they MUST keep their id param — those are simply revoked
-- from anon/authenticated rather than guarded in-body.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Drop a stale activate_seller overload that lingers only on the live DB.
--    An earlier version was activate_seller(p_code, p_user_id); a later arg-order
--    change created activate_seller(p_user_id, p_code) as a SECOND function via
--    CREATE OR REPLACE (the signature changed) instead of replacing it. Both
--    overloads share the same param NAMES, so a named-param call passing both
--    args is ambiguous (currently dormant only because SELLER_INVITE_REQUIRED is
--    false). The app only ever calls the (p_user_id, p_code) form — drop the old.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.activate_seller(p_code text, p_user_id uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Category A — service-role ONLY (called from Edge Functions stripe-payout /
--    stripe-connect-status). No app code calls these. Revoke from anon +
--    authenticated; service_role keeps EXECUTE. No body change: auth.uid() is
--    NULL in the service-role context, so an in-body guard would break payouts.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL    ON FUNCTION public.claim_available_balance(uuid)             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_available_balance(uuid)             TO service_role;

REVOKE ALL    ON FUNCTION public.restore_available_balance(uuid, numeric)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_available_balance(uuid, numeric)  TO service_role;

REVOKE ALL    ON FUNCTION public.increment_pending_balance(uuid, numeric)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_pending_balance(uuid, numeric)  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Category B — app-called as the logged-in user. Keep callable by
--    authenticated, but reject a forged id: the passed id must equal auth.uid().
--    Mirrors the existing guard in increment_boosts_used / submit_order_appeal.
--    A real user's auth.uid() already equals the id they pass, so legitimate
--    callers see no change.
-- ─────────────────────────────────────────────────────────────────────────────

-- mark_order_shipped: a seller marks their own paid order as shipped.
CREATE OR REPLACE FUNCTION public.mark_order_shipped(
  p_order_id  UUID,
  p_seller_id UUID,
  p_tracking  TEXT,
  p_courier   TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.orders
  SET
    status          = 'shipped',
    tracking_number = p_tracking,
    courier         = p_courier,
    shipped_at      = NOW(),
    auto_release_at = NOW() + INTERVAL '7 days'
  WHERE
    id        = p_order_id
    AND seller_id = p_seller_id
    AND status    = 'paid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.mark_order_shipped(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_shipped(uuid, uuid, text, text) TO authenticated;

-- confirm_order_receipt: a buyer confirms receipt of their own shipped order.
CREATE OR REPLACE FUNCTION public.confirm_order_receipt(
  p_order_id UUID,
  p_buyer_id UUID
)
RETURNS void AS $$
BEGIN
  IF p_buyer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.orders
  SET
    status          = 'delivered',
    delivered_at    = NOW(),
    auto_release_at = NOW() + INTERVAL '2 days'
  WHERE
    id       = p_order_id
    AND buyer_id = p_buyer_id
    AND status   = 'shipped';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.confirm_order_receipt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_receipt(uuid, uuid) TO authenticated;

-- activate_seller: a user activates themselves as a seller (optionally consuming
-- an invite code). Guard p_user_id against auth.uid() so nobody can flip the
-- is_seller flag on another account or mint invites for someone else.
CREATE OR REPLACE FUNCTION public.activate_seller(p_user_id UUID, p_code TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
  v_username TEXT;
  v_i INT;
  v_code TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- If a code was provided, consume it
  IF p_code IS NOT NULL THEN
    UPDATE public.invites
    SET is_used = TRUE, used_at = NOW(), used_by = p_user_id
    WHERE code = p_code AND is_used = FALSE;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Activate seller
  UPDATE public.users
  SET is_seller = TRUE
  WHERE id = p_user_id;

  -- Generate 3 single-use invite codes for this seller
  SELECT username INTO v_username FROM public.users WHERE id = p_user_id;
  FOR v_i IN 1..3 LOOP
    v_code := upper(substring(v_username, 1, 5)) || '-' || upper(substring(md5(random()::text), 1, 4));
    INSERT INTO public.invites (code, created_by)
    VALUES (v_code, p_user_id)
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.activate_seller(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_seller(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. consume_invite — dead code (activate_seller does its own invite handling;
--    no caller anywhere in either repo). Lock it to service-role so it can't be
--    used to burn arbitrary invite codes.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL    ON FUNCTION public.consume_invite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invite(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. invites UPDATE policy was scoped to "any authenticated user", letting anyone
--    edit anyone's invite row. Scope it to the invite's creator. Invite
--    consumption now runs only inside SECURITY DEFINER activate_seller (which
--    bypasses RLS), and the app only ever SELECTs from invites, so no legitimate
--    client UPDATE path is lost.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can update invites" ON public.invites;
CREATE POLICY "Users can update invites they created"
  ON public.invites FOR UPDATE
  USING ((select auth.uid()) = created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Pin search_path on SECURITY DEFINER / trigger functions flagged by the
--    Supabase advisor (function_search_path_mutable). Prevents search_path
--    injection. All four reference only public objects + built-ins.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.set_dispatch_deadline()                 SET search_path = public;
ALTER FUNCTION public.compute_error_fingerprint(text, text)   SET search_path = public;
ALTER FUNCTION public.app_errors_set_fingerprint()            SET search_path = public;
ALTER FUNCTION public.app_error_issues_touch_updated_at()     SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Default-deny EXECUTE on FUTURE functions so a new RPC isn't auto-exposed to
--    PUBLIC. From now on, any client-callable function needs an explicit GRANT.
--    Applies to functions created by the migration role (postgres); does not
--    touch existing functions.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
