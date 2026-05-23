-- The "Listings are publicly viewable" policy was created with TO authenticated,
-- so the public anon role couldn't read non-draft listings. That blocked the
-- new dukanoh.com/listing/[id] landing page — shared links would 404 because
-- the unauthenticated SSR fetch returned no rows.
--
-- schema.sql already declares this policy without a TO clause (= PUBLIC); the
-- live DB had drifted to TO authenticated via an older migration. Recreate it
-- without TO so the policy applies to both anon and authenticated. The USING
-- expression already restricts drafts to their owner.

DROP POLICY IF EXISTS "Listings are publicly viewable" ON public.listings;

CREATE POLICY "Listings are publicly viewable"
  ON public.listings FOR SELECT
  USING (status != 'draft' OR (select auth.uid()) = seller_id);
