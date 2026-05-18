-- Admin override for the locked flag columns on public.users.
--
-- The "Users can update own profile" RLS policy locks seller_tier,
-- pro_expires_at, had_free_trial, is_verified, is_official, tax_hold against
-- client writes (security audit, see schema.sql comment). That correctly
-- prevents Pro tier theft from the bundled anon key.
--
-- The in-app Account Flags screen (app/admin/account-flags.tsx) needs to
-- toggle a subset of those columns for admin testing. This SECURITY DEFINER
-- function is the privileged path: it verifies the caller is in
-- platform_settings.admin_user_ids before applying a whitelisted patch.

CREATE OR REPLACE FUNCTION public.admin_update_user_flags(
  target_user_id uuid,
  patch          jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
  allowed_keys    text[] := ARRAY['is_seller','is_verified','seller_tier','tax_hold','tax_id_collected_at'];
  unknown_keys    text[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT ARRAY(SELECT k FROM jsonb_object_keys(patch) k WHERE NOT (k = ANY(allowed_keys)))
    INTO unknown_keys;
  IF array_length(unknown_keys, 1) > 0 THEN
    RAISE EXCEPTION 'disallowed keys: %', unknown_keys;
  END IF;

  UPDATE public.users SET
    is_seller            = COALESCE((patch->>'is_seller')::boolean,         is_seller),
    is_verified          = COALESCE((patch->>'is_verified')::boolean,       is_verified),
    seller_tier          = COALESCE(patch->>'seller_tier',                  seller_tier),
    tax_hold             = COALESCE((patch->>'tax_hold')::boolean,          tax_hold),
    tax_id_collected_at  = CASE
                             WHEN patch ? 'tax_id_collected_at'
                             THEN NULLIF(patch->>'tax_id_collected_at','')::timestamptz
                             ELSE tax_id_collected_at
                           END
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_flags(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_flags(uuid, jsonb) TO authenticated;
