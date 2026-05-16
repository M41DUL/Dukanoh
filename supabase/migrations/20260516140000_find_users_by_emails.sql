-- Admin-only RPC for the /admin/account-deletion view. Takes a list of
-- emails (as entered into the public web deletion form) and returns the
-- matching public.users row (if any) so the admin UI can show whether the
-- request maps to a real account before processing.

CREATE OR REPLACE FUNCTION public.find_users_by_emails(p_emails TEXT[])
RETURNS TABLE (
  email           TEXT,
  user_id         UUID,
  username        TEXT,
  account_status  TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    au.email::TEXT     AS email,
    u.id               AS user_id,
    u.username         AS username,
    u.account_status   AS account_status
  FROM auth.users au
  JOIN public.users u ON u.id = au.id
  WHERE LOWER(au.email) = ANY (
    SELECT LOWER(e) FROM unnest(p_emails) AS e
  );
$$;

REVOKE ALL ON FUNCTION public.find_users_by_emails(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_users_by_emails(TEXT[]) TO service_role;
