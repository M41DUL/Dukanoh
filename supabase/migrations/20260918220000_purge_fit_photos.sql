-- Dukanoh Fit photo retention (Privacy §2/§4/§14: "up to 24 months").
--
-- The photos are stored unlinked (no member id) in the private fit-training
-- bucket, so nothing else can ever delete them. A nightly pg_cron job calls the
-- purge-fit-photos edge function through pg_net with x-dukanoh-key (Vault:
-- supabase_url, INTERNAL_API_KEY); the function removes files via the Storage
-- API and deletes the matching garment_labels rows. Retention is a setting so
-- it can change without a deploy.

INSERT INTO public.platform_settings (key, value)
VALUES ('fit_photo_retention_months', '24')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-fit-photos') THEN
    PERFORM cron.unschedule('purge-fit-photos');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-fit-photos',
  '45 4 * * *',
  $cmd$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/purge-fit-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dukanoh-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_API_KEY')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
