-- 1. boosts table — sellers can DELETE their own boosts (used by useRemoveBoost).
--    No UPDATE policy is added; the boost lifecycle is INSERT once + DELETE on
--    cancel, no client-side updates are legitimate.
CREATE POLICY "Sellers can delete their own boosts"
  ON public.boosts
  FOR DELETE
  TO authenticated
  USING (( SELECT auth.uid() ) = seller_id);

-- 2. cancellation_strikes — sellers can INSERT strikes for themselves (used by
--    useCancelOrder when the seller cancels their own order). A seller can only
--    self-strike, which has no abuse benefit; legitimate inserts happen via
--    the cancel-with-refund flow.
CREATE POLICY "Sellers can record their own cancellation strikes"
  ON public.cancellation_strikes
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT auth.uid() ) = seller_id);

-- 3. users UPDATE — tighten the WITH CHECK so the client cannot promote
--    itself to Pro, extend its trial, or grant verification badges. The
--    existing policy locked rating_avg / rating_count; this extension adds
--    the paid-feature and trust columns. The revenuecat-webhook edge
--    function uses the service-role key (bypasses RLS) so legitimate
--    Pro lifecycle writes still work.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (( SELECT auth.uid() ) = id)
  WITH CHECK (
    ( SELECT auth.uid() ) = id
    AND NOT (rating_avg          IS DISTINCT FROM ( SELECT u.rating_avg          FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (rating_count        IS DISTINCT FROM ( SELECT u.rating_count        FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (seller_tier         IS DISTINCT FROM ( SELECT u.seller_tier         FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (pro_expires_at      IS DISTINCT FROM ( SELECT u.pro_expires_at      FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (had_free_trial      IS DISTINCT FROM ( SELECT u.had_free_trial      FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (is_verified         IS DISTINCT FROM ( SELECT u.is_verified         FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (is_official         IS DISTINCT FROM ( SELECT u.is_official         FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
    AND NOT (tax_hold            IS DISTINCT FROM ( SELECT u.tax_hold            FROM public.users u WHERE u.id = ( SELECT auth.uid() ) ))
  );
