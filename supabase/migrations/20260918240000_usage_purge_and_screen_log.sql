-- (1) Retention for first-party usage records (Privacy §14: up to 26 months).
--     listing_views, story_views, fit_search_logs, fit_result_taps and
--     recognition_events had no deletion at all.
-- (2) A trust-and-safety log of automated photo-screening verdicts, so the
--     Transparency Report can count listings reviewed and blocked by automated
--     systems and an appeal can see the original verdict. Service-role only;
--     purged after 3 years (Privacy §14, trust & safety logs).

CREATE TABLE IF NOT EXISTS public.listing_screen_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  photo_index    INT NOT NULL,
  photo_count    INT NOT NULL,
  outcome        TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'unavailable')),
  blocked        BOOLEAN NOT NULL DEFAULT FALSE,
  reasons        TEXT[] NOT NULL DEFAULT '{}',
  warnings       TEXT[] NOT NULL DEFAULT '{}',
  is_clothing    BOOLEAN,
  engine         TEXT,
  engine_version TEXT,
  model          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listing_screen_events IS
  'One row per photo screened by analyse-listing-image: blocked/allowed, reasons, quality flags. Trust & safety log for the Transparency Report; purged after 3 years.';

ALTER TABLE public.listing_screen_events ENABLE ROW LEVEL SECURITY;
-- No policies: default-deny for anon/authenticated; service role only.

CREATE INDEX IF NOT EXISTS idx_listing_screen_events_created ON public.listing_screen_events (created_at);
CREATE INDEX IF NOT EXISTS idx_listing_screen_events_blocked ON public.listing_screen_events (created_at) WHERE blocked;

CREATE OR REPLACE FUNCTION public.purge_usage_records()
RETURNS void AS $$
BEGIN
  DELETE FROM public.listing_views          WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.story_views            WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_search_logs        WHERE searched_at < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_result_taps        WHERE tapped_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.recognition_events     WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.listing_screen_events  WHERE created_at  < NOW() - INTERVAL '3 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.purge_usage_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_usage_records() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-usage-records') THEN
    PERFORM cron.unschedule('purge-usage-records');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-usage-records',
  '0 5 * * *',
  'SELECT public.purge_usage_records()'
);
