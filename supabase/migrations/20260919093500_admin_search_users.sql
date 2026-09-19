-- Server-side user search for the admin Users page.
--
-- The page used to splice the raw query into a PostgREST `.or()` filter, where
-- a comma or bracket is syntax: searching "Khan, Ali" errored the whole page.
-- Running the search in SQL takes the text as a bound parameter, matches
-- username and user_private.full_name in one query, and applies the row limit
-- after filtering. LIKE wildcards in the input are escaped so "%" and "_" are
-- matched literally.

CREATE OR REPLACE FUNCTION public.admin_search_users(p_q TEXT, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id              UUID,
  username        TEXT,
  full_name       TEXT,
  account_status  TEXT,
  is_verified     BOOLEAN,
  seller_tier     TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH needle AS (
    SELECT '%' || replace(replace(replace(lower(btrim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pattern
  )
  SELECT
    u.id,
    u.username::TEXT,
    up.full_name::TEXT,
    u.account_status::TEXT,
    u.is_verified,
    u.seller_tier::TEXT,
    u.created_at
  FROM public.users u
  LEFT JOIN public.user_private up ON up.user_id = u.id
  CROSS JOIN needle
  WHERE NULLIF(btrim(p_q), '') IS NOT NULL
    AND (
      lower(u.username) LIKE needle.pattern ESCAPE '\'
      OR lower(COALESCE(up.full_name, '')) LIKE needle.pattern ESCAPE '\'
    )
  ORDER BY u.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_search_users(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, INT) TO service_role;
