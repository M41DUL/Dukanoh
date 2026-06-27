-- Fix + harden the auto-cancel-unverified-orders maintenance cron.
--
-- BUG: the existing pg_cron job invoked the edge function via net.http_post but
--   (a) read the project URL from the WRONG vault column (`value` instead of
--       `decrypted_secret`), and
--   (b) relied on vault secrets that were never created (the vault was empty).
--   Result: the job FAILED on every run ("column \"value\" does not exist") and
--   the edge function never executed. Because this same function auto-refunds a
--   buyer when a seller misses the 5-day dispatch deadline, buyer refunds were
--   silently not happening. It also now performs seller settlement (paying
--   verified sellers for their completed, platform-held unverified-origin
--   orders), which likewise was not running.
--
-- FIX: recreate the job with the correct column name + secret names, and bump the
--   cadence from daily (0 3 * * *) to hourly (0 * * * *) so buyer refunds and
--   settlement are timely.
--
-- PREREQUISITE (set out-of-band, not in this migration — secrets must not live in
-- version control): two Supabase Vault secrets must exist:
--   • supabase_url      = https://<project-ref>.supabase.co
--   • INTERNAL_API_KEY  = the same value as the edge function's INTERNAL_API_KEY
--                         secret (the function checks it against the x-dukanoh-key
--                         header). Rotated 2026-06-27.

-- Guarded: cron.unschedule throws if the job is absent (fresh DB / CI run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-cancel-unverified-orders') THEN
    PERFORM cron.unschedule('auto-cancel-unverified-orders');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-cancel-unverified-orders',
  '0 * * * *',
  $cmd$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/auto-cancel-unverified-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dukanoh-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_API_KEY')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
