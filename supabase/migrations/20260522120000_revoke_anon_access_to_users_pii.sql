-- Interim PII hardening for public.users
--
-- public.users has a SELECT policy of USING (true). Combined with the public
-- `anon` API key (shipped inside the mobile app bundle and the website), this
-- let ANY anonymous caller read every column of every user row -- including
-- phone, dob, real name and address -- straight off the PostgREST API with no
-- account required.
--
-- This migration changes no policy and no application code. It uses Postgres
-- column-level privileges to restrict the `anon` role to only the columns a
-- logged-out visitor legitimately needs (public seller-profile fields). The
-- `authenticated` and `service_role` roles are untouched, so the logged-in
-- app, the admin web app and Edge Functions are unaffected.
--
-- The follow-up migration (move_pii_to_user_private) additionally moves the
-- real PII columns out of public.users into a private own-row-RLS table, which
-- also closes the same leak for the `authenticated` role.

REVOKE SELECT ON public.users FROM anon;

-- Re-grant only the columns that are safe for cross-user / logged-out reads
-- (public seller-profile fields). Any column NOT listed here -- and any column
-- added to public.users in future -- is unreadable by `anon` by default.
GRANT SELECT (
  id,
  username,
  avatar_url,
  bio,
  created_at,
  is_seller,
  is_verified,
  is_official,
  seller_tier,
  avg_response_time_mins,
  rating_avg,
  rating_count,
  tax_hold,
  deleted_at
) ON public.users TO anon;
