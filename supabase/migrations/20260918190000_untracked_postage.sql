-- Untracked postage at the seller's risk (Terms 14).
--
-- Sellers may post with or without tracking. When marking an order as
-- dispatched they must either give a tracking/reference number or explicitly
-- confirm untracked postage. An untracked order that the buyer reports as not
-- received is resolved for the buyer (the seller bears the loss); tracking that
-- shows delivery is treated as proof of delivery.
--
-- mark_order_shipped previously accepted an empty tracking number silently. The
-- old 4-argument signature is DROPPED (not overloaded) so PostgREST has one
-- candidate; older app builds that omit p_untracked still resolve to this
-- function through the default.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS posted_untracked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders.posted_untracked IS
  'Seller confirmed untracked postage at dispatch (Terms 14). A not-received dispute on such an order is resolved for the buyer.';

DROP FUNCTION IF EXISTS public.mark_order_shipped(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.mark_order_shipped(
  p_order_id  UUID,
  p_seller_id UUID,
  p_tracking  TEXT,
  p_courier   TEXT    DEFAULT NULL,
  p_untracked BOOLEAN DEFAULT FALSE
)
RETURNS void AS $$
BEGIN
  IF p_seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF NOT COALESCE(p_untracked, FALSE) AND (p_tracking IS NULL OR btrim(p_tracking) = '') THEN
    RAISE EXCEPTION 'tracking_required'
      USING HINT = 'Enter the tracking or reference number, or confirm untracked postage.';
  END IF;

  UPDATE public.orders
  SET
    status           = 'shipped',
    tracking_number  = CASE WHEN COALESCE(p_untracked, FALSE) THEN NULL ELSE btrim(p_tracking) END,
    courier          = CASE WHEN COALESCE(p_untracked, FALSE) THEN NULL ELSE NULLIF(btrim(p_courier), '') END,
    posted_untracked = COALESCE(p_untracked, FALSE),
    shipped_at       = NOW(),
    auto_release_at  = NOW() + INTERVAL '7 days'
  WHERE
    id        = p_order_id
    AND seller_id = p_seller_id
    AND status    = 'paid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.mark_order_shipped(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_shipped(uuid, uuid, text, text, boolean) TO authenticated;
