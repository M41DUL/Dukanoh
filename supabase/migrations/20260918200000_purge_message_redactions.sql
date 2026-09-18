-- Message originals captured by the contact-detail redaction trigger are kept
-- for 90 days for misuse review, then deleted (Privacy §10). Previously they
-- had no expiry.

CREATE OR REPLACE FUNCTION public.purge_message_redactions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.message_redactions
   WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.purge_message_redactions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_message_redactions() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-message-redactions') THEN
    PERFORM cron.unschedule('purge-message-redactions');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-message-redactions',
  '15 4 * * *',
  'SELECT public.purge_message_redactions()'
);
