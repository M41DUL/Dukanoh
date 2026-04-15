-- Adds the delete_user_account RPC called from the app settings screen.
--
-- Cascade chain when auth.users row is deleted:
--   auth.users
--     → public.users          ON DELETE CASCADE
--       → listings            ON DELETE CASCADE
--       → collections         ON DELETE CASCADE
--       → conversations       ON DELETE CASCADE
--       → messages            ON DELETE CASCADE
--       → reviews             ON DELETE CASCADE
--       → saved_items         ON DELETE CASCADE
--       → reports             ON DELETE CASCADE
--       → blocked_users       ON DELETE CASCADE
--       → push_tokens         ON DELETE CASCADE
--       → listing_views       ON DELETE CASCADE
--       → story_views         ON DELETE CASCADE
--       → profile_views       ON DELETE CASCADE
--       → notifications       ON DELETE CASCADE
--       → cancellation_strikes ON DELETE CASCADE
--       → boosts              ON DELETE CASCADE
--       → seller_wallet       ON DELETE CASCADE
--       → fit_search_logs     ON DELETE CASCADE
--
-- Financial records preserved via SET NULL:
--   orders, transactions, dispute_evidence

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
