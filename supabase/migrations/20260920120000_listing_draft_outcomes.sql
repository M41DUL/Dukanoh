-- Listing drafts (2026-09-20). The sell form fills title, description, fabric
-- and occasion from the photos (analyse-listing-image, engine
-- recognise-2026-09d). Two things to measure:
-- (1) what the seller did with each drafted field at publish, so the drafts
--     can be scored by engine version and seller tier;
-- (2) near-identical titles among live drafted listings, so template-like
--     drafts are caught early.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.listing_draft_outcomes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          UUID        NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_tier         TEXT        NOT NULL DEFAULT 'free' CHECK (seller_tier IN ('free', 'pro', 'founder')),
  title_outcome       TEXT        NOT NULL CHECK (title_outcome       IN ('none', 'kept', 'edited', 'replaced', 'cleared')),
  description_outcome TEXT        NOT NULL CHECK (description_outcome IN ('none', 'kept', 'edited', 'replaced', 'cleared')),
  fabric_outcome      TEXT        NOT NULL CHECK (fabric_outcome      IN ('none', 'kept', 'edited', 'replaced', 'cleared')),
  occasion_outcome    TEXT        NOT NULL CHECK (occasion_outcome    IN ('none', 'kept', 'edited', 'replaced', 'cleared')),
  engine_version      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listing_draft_outcomes IS
  'One row per published listing that had a drafted field: kept / edited / replaced / cleared per field. No listing text is stored. Written by the app at publish; read with the service role. Usage record, purged after 26 months.';

CREATE INDEX IF NOT EXISTS idx_listing_draft_outcomes_created ON public.listing_draft_outcomes (created_at);
CREATE INDEX IF NOT EXISTS idx_listing_draft_outcomes_user    ON public.listing_draft_outcomes (user_id);

ALTER TABLE public.listing_draft_outcomes ENABLE ROW LEVEL SECURITY;

-- A member records the outcome for a listing they published. Nobody reads
-- through the API: the views below are service-role only.
CREATE POLICY "listing_draft_outcomes_insert_own"
  ON public.listing_draft_outcomes FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = (select auth.uid()))
  );

-- Scoreboard: per week, engine version and tier, how each drafted field fared.
CREATE OR REPLACE VIEW public.listing_draft_scoreboard AS
SELECT
  date_trunc('week', created_at)::date                                           AS week,
  engine_version,
  seller_tier,
  count(*)::int                                                                  AS listings,
  count(*) FILTER (WHERE title_outcome = 'kept')::int                            AS title_kept,
  count(*) FILTER (WHERE title_outcome = 'edited')::int                          AS title_edited,
  count(*) FILTER (WHERE title_outcome IN ('replaced', 'cleared'))::int          AS title_replaced,
  count(*) FILTER (WHERE description_outcome = 'kept')::int                      AS description_kept,
  count(*) FILTER (WHERE description_outcome = 'edited')::int                    AS description_edited,
  count(*) FILTER (WHERE description_outcome IN ('replaced', 'cleared'))::int    AS description_replaced,
  count(*) FILTER (WHERE fabric_outcome = 'kept')::int                           AS fabric_kept,
  count(*) FILTER (WHERE fabric_outcome IN ('replaced', 'cleared'))::int         AS fabric_changed,
  count(*) FILTER (WHERE occasion_outcome = 'kept')::int                         AS occasion_kept,
  count(*) FILTER (WHERE occasion_outcome IN ('replaced', 'cleared'))::int       AS occasion_changed
FROM public.listing_draft_outcomes
GROUP BY 1, 2, 3;
REVOKE ALL ON public.listing_draft_scoreboard FROM anon, authenticated;

-- Pairs of live listings from different sellers, both published with a drafted
-- title in the last 90 days, whose titles are near-identical. A rising count
-- means the drafts read as one template and the prompt needs more specifics.
CREATE OR REPLACE VIEW public.listing_draft_title_pairs AS
SELECT a.id AS listing_a, b.id AS listing_b, a.title AS title_a, b.title AS title_b,
       extensions.similarity(a.title, b.title) AS similarity
FROM public.listings a
JOIN public.listings b
  ON b.id > a.id AND b.status = 'available' AND b.seller_id <> a.seller_id
  AND b.published_at > now() - interval '90 days'
JOIN public.listing_draft_outcomes oa ON oa.listing_id = a.id AND oa.title_outcome IN ('kept', 'edited')
JOIN public.listing_draft_outcomes ob ON ob.listing_id = b.id AND ob.title_outcome IN ('kept', 'edited')
WHERE a.status = 'available' AND a.published_at > now() - interval '90 days'
  AND extensions.similarity(a.title, b.title) >= 0.8;
REVOKE ALL ON public.listing_draft_title_pairs FROM anon, authenticated;

-- Usage record: same 26-month retention as the other first-party usage logs.
CREATE OR REPLACE FUNCTION public.purge_usage_records()
RETURNS void AS $$
BEGIN
  DELETE FROM public.listing_views          WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.story_views            WHERE viewed_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_search_logs        WHERE searched_at < NOW() - INTERVAL '26 months';
  DELETE FROM public.fit_result_taps        WHERE tapped_at   < NOW() - INTERVAL '26 months';
  DELETE FROM public.recognition_events     WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.listing_draft_outcomes WHERE created_at  < NOW() - INTERVAL '26 months';
  DELETE FROM public.listing_screen_events  WHERE created_at  < NOW() - INTERVAL '3 years';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
