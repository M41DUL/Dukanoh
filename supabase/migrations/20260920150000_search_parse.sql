-- Search parse (2026-09-20). What a member types in the search bar becomes the
-- listing filters. The phone's dictionary does most of it; leftovers go to the
-- parse-search Edge Function, which asks Claude once per distinct phrase and
-- caches the answer here. Neither table carries a member id.

-- The cache and, over time, a dictionary of how members actually search.
CREATE TABLE IF NOT EXISTS public.search_parses (
  query_norm   TEXT        PRIMARY KEY CHECK (char_length(query_norm) BETWEEN 1 AND 120),
  parse        JSONB       NOT NULL,
  model        TEXT,
  version      TEXT,
  hits         INT         NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.search_parses IS
  'Cache of Claude search parses keyed by the normalised phrase. No member id. Written and read by parse-search with the service role.';
ALTER TABLE public.search_parses ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- One row per search the app ran, with how many results came back, so the
-- phrases that find nothing can be read off. No member id, no ordering by
-- member; a usage record purged after 26 months.
CREATE TABLE IF NOT EXISTS public.search_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_norm   TEXT        NOT NULL CHECK (char_length(query_norm) BETWEEN 1 AND 120),
  parse        JSONB,
  source       TEXT        CHECK (source IN ('rules', 'claude', 'cache')),
  result_count INT         CHECK (result_count IS NULL OR result_count >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.search_events IS
  'One row per search run by the app: the phrase, its parse, which layer parsed it and the result count. No member id. Purged after 26 months.';
CREATE INDEX IF NOT EXISTS idx_search_events_created ON public.search_events (created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_zero    ON public.search_events (query_norm) WHERE result_count = 0;
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "search_events_insert"
  ON public.search_events FOR INSERT
  TO authenticated
  WITH CHECK (true);
-- No SELECT for members: the view below is service-role only.

-- What members looked for and did not find, last 90 days.
CREATE OR REPLACE VIEW public.search_zero_results AS
SELECT
  query_norm,
  count(*)::int                                          AS searches,
  max(created_at)                                        AS last_seen,
  (array_agg(parse ORDER BY created_at DESC))[1]         AS parse,
  (array_agg(source ORDER BY created_at DESC))[1]        AS source
FROM public.search_events
WHERE result_count = 0 AND created_at > now() - interval '90 days'
GROUP BY query_norm
ORDER BY searches DESC, last_seen DESC;
REVOKE ALL ON public.search_zero_results FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_usage_records()
RETURNS void AS $$
BEGIN
  DELETE FROM public.listing_views          WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.story_views            WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_search_logs        WHERE searched_at < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_result_taps        WHERE tapped_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.recognition_events     WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.listing_draft_outcomes WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.search_events          WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.listing_screen_events  WHERE created_at  < NOW() - INTERVAL '3 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
