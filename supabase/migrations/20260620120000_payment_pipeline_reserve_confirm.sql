-- Payment pipeline: reserve → charge → confirm.
--
-- WHY: the old flow created the Stripe charge with no order, then created the
-- order client-side / in the webhook with ON CONFLICT(listing_id) DO NOTHING.
-- Two buyers could both be charged for one listing, and the loser's payment was
-- silently orphaned (charged, no order, no refund). The new flow reserves the
-- listing with a short-lived 'pending' order at PaymentIntent creation (atomic
-- via UNIQUE(listing_id)), so a second buyer is rejected BEFORE any charge; the
-- webhook then confirms 'pending' → 'paid'. This migration adds the 'pending'
-- status and a cron that releases abandoned reservations.

-- 1. Allow 'pending' as an order status (the reservation state).
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','created','paid','shipped','delivered','completed','disputed','resolved','cancelled'));

-- 1b. One ACTIVE order per listing. The old UNIQUE(listing_id) also counted
--     CANCELLED orders, which permanently blocked re-listing: once a listing had
--     any order (e.g. a cancelled reservation or a refunded purchase), a new
--     buyer's INSERT would conflict and their payment would orphan. Replace it
--     with a partial unique index that excludes 'cancelled', so a relisted item
--     can be bought again while two concurrent buyers still can't both hold an
--     active order (this is the reservation lock).
ALTER TABLE public.orders DROP CONSTRAINT orders_listing_id_unique;
CREATE UNIQUE INDEX orders_listing_id_active_unique
  ON public.orders (listing_id) WHERE status <> 'cancelled';

-- 2. Release abandoned reservations. Cancels 'pending' orders older than 20 min
--    (longer than a realistic 3DS / Apple Pay / bank-app session, so we never
--    refund a buyer who is still completing payment) and frees the listing back
--    to 'available'. The buyer is never charged for a 'pending' order; if their
--    payment lands after this runs, the webhook finds no pending row and
--    auto-refunds. Mirrors auto_release_orders().
CREATE OR REPLACE FUNCTION public.cancel_stale_pending_orders()
RETURNS void AS $$
BEGIN
  WITH stale AS (
    UPDATE public.orders
    SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'system'
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '20 minutes'
    RETURNING listing_id
  )
  UPDATE public.listings
  SET status = 'available', buyer_id = NULL, sold_at = NULL
  WHERE id IN (SELECT listing_id FROM stale WHERE listing_id IS NOT NULL)
    AND status <> 'available';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_stale_pending_orders() TO postgres;

-- Runs every 5 minutes.
SELECT cron.schedule(
  'cancel-stale-pending-orders',
  '*/5 * * * *',
  'SELECT public.cancel_stale_pending_orders()'
);
