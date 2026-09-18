-- Reviews can only be written once the order has actually finished.
--
-- WHY: the old INSERT policy only checked that the listing was 'sold' to the
-- reviewer, which is true from the moment they pay. A buyer could rate a seller
-- before the piece was dispatched, let alone received. Terms clause 12 now says
-- a Buyer may review after an order has completed (or a dispute on it has been
-- decided), and the DMCC Act 2024 expects platforms to take reasonable steps
-- against misleading reviews.
--
-- HOW: require a matching order for the same listing and seller, owned by the
-- reviewer, in status 'completed' (normal finish, or dispute decided for the
-- seller and appeal window passed) or 'resolved' (dispute decided; a refunded
-- buyer may still review the experience). One review per listing is already
-- enforced by UNIQUE (reviewer_id, listing_id).

DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "Users can create reviews"
  ON public.reviews FOR INSERT WITH CHECK (
    (select auth.uid()) = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.listing_id = reviews.listing_id
        AND o.seller_id  = reviews.seller_id
        AND o.buyer_id   = (select auth.uid())
        AND o.status IN ('completed', 'resolved')
    )
  );
