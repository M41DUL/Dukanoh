-- Push token registration hardening.
--
-- Background: a push token identifies a physical device, not an account. When a
-- device switched accounts, the client tried to detach the token from the old
-- account with a client-side DELETE ... WHERE user_id <> me. RLS only allows a
-- user to delete their OWN rows, so that delete silently matched nothing and the
-- token stayed registered to the previous account — delivering that account's
-- (private) notifications to whoever holds the device now.
--
-- Fix: a SECURITY DEFINER RPC that performs the privileged cross-account detach
-- and then claims the token for the caller. The caller can only ever claim a
-- token FOR THEMSELVES (user_id is auth.uid(), never a parameter), so this grants
-- no ability to move a token between two other accounts.
--
-- The existing UNIQUE (user_id, token) constraint is deliberately kept so that
-- already-installed app versions, which upsert on that constraint, keep working.
-- A stricter UNIQUE (token) is left for a later migration once all clients call
-- this RPC.

-- 1. One-time cleanup: collapse duplicate tokens to the most-recently-updated row.
DELETE FROM public.push_tokens
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (PARTITION BY token ORDER BY updated_at DESC, id DESC) AS rn
    FROM public.push_tokens
  ) ranked
  WHERE ranked.rn > 1
);

-- 2. One-time cleanup: drop tokens still attached to already-deleted accounts.
--    (anonymize_user_account already does this going forward; this sweeps history.)
DELETE FROM public.push_tokens pt
USING public.users u
WHERE pt.user_id = u.id
  AND u.deleted_at IS NOT NULL;

-- 3. Registration RPC.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'token is required';
  END IF;

  -- Detach this device's token from any other account.
  DELETE FROM public.push_tokens
  WHERE token = p_token AND user_id <> v_uid;

  -- Claim it for the caller (or bump updated_at if already theirs).
  INSERT INTO public.push_tokens (user_id, token, updated_at)
  VALUES (v_uid, p_token, now())
  ON CONFLICT (user_id, token) DO UPDATE SET updated_at = now();
END;
$$;

-- Default-deny, then grant only to signed-in users (see project_db_function_grants).
REVOKE ALL ON FUNCTION public.register_push_token(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text) TO authenticated;
