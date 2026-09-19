-- Complete the default-deny for new functions.
--
-- 20260607112508_harden_security_definer_rpcs revoked the PUBLIC default grant
-- on future functions, but Supabase also grants EXECUTE on functions created
-- by `postgres` directly to anon, authenticated and service_role (see
-- pg_default_acl for role postgres). That direct grant is why
-- admin_search_orders, created after the hardening, was still callable with
-- the app's anon key. Drop anon and authenticated from the postgres defaults.
--
-- From now on a client-callable function MUST carry an explicit
--   GRANT EXECUTE ON FUNCTION ... TO authenticated;
-- (recent migrations already do this). service_role keeps its default grant,
-- so server-only helpers and the admin console keep working. Existing
-- functions are unaffected.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
