-- admin_search_orders was created with `REVOKE ALL ... FROM PUBLIC` only.
-- Supabase's default privileges also grant EXECUTE on new public functions
-- directly to anon and authenticated, and a revoke from PUBLIC leaves those
-- direct grants in place. The function is SECURITY DEFINER, so it stayed
-- callable through PostgREST with the app's public anon key and returned
-- every order with buyer and seller usernames.
--
-- Every other admin RPC revokes from anon and authenticated explicitly; bring
-- this one in line. The admin console calls it with the service role, which
-- keeps EXECUTE.

REVOKE ALL ON FUNCTION public.admin_search_orders(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_orders(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT)
  TO service_role;
