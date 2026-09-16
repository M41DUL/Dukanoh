-- Dukanoh Fit hardening — launch-readiness review, 2026-09-16.
--
-- 1. record_fit_search(): reject unauthenticated callers in-body and move it
--    onto the post-June default-deny convention (REVOKE from PUBLIC / anon,
--    GRANT to authenticated). It has been executable by anon since April
--    because it predates the ALTER DEFAULT PRIVILEGES change; an anon call
--    only failed on the NOT NULL user_id insert.
-- 2. fit_training_images: the live table has RLS enabled but no policy
--    (deny by default). Add the explicit deny-all policy that schema.sql
--    already describes so the two match.
-- 3. fit_result_taps: records a member opening a Dukanoh Fit result, so the
--    feature's success metric (tap-through from a Fit search) is measurable.
--    Join to saved_items / orders to see whether tapped pieces were saved or
--    bought.

CREATE OR REPLACE FUNCTION public.record_fit_search()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Advisory lock scoped to this transaction — prevents concurrent inserts
  -- from the same user bypassing the count check
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));

  SELECT COUNT(*) INTO today_count
  FROM fit_search_logs
  WHERE user_id = auth.uid()
    AND searched_at >= CURRENT_DATE;

  IF today_count >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO fit_search_logs (user_id) VALUES (auth.uid());
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_fit_search() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fit_search() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fit_training_images'
      AND policyname = 'fit_training_images_no_client_access'
  ) THEN
    CREATE POLICY "fit_training_images_no_client_access"
      ON public.fit_training_images FOR ALL
      TO authenticated
      USING (false);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fit_result_taps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id  UUID        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  tapped_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fit_result_taps_user_date
  ON public.fit_result_taps (user_id, tapped_at);
CREATE INDEX IF NOT EXISTS idx_fit_result_taps_listing
  ON public.fit_result_taps (listing_id);

ALTER TABLE public.fit_result_taps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fit_result_taps'
      AND policyname = 'fit_result_taps_insert_own'
  ) THEN
    CREATE POLICY "fit_result_taps_insert_own"
      ON public.fit_result_taps FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fit_result_taps'
      AND policyname = 'fit_result_taps_select_own'
  ) THEN
    CREATE POLICY "fit_result_taps_select_own"
      ON public.fit_result_taps FOR SELECT
      TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;
END $$;
