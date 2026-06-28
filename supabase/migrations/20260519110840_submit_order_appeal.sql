-- Appeal submission RPC for disputed-order resolutions.
--
-- The mobile useAppealDispute mutation used to write to orders directly via
-- PostgREST, which had two bugs:
--   1. The orders UPDATE policy left `appeal_by` unconstrained, so a buyer
--      could call PostgREST directly and set appeal_by='seller', framing the
--      seller as the appellant on the admin dispute queue.
--   2. The sellers' RLS UPDATE policy only allows status='cancelled', so a
--      seller could never appeal at all — their appeal would silently fail
--      the WITH CHECK gate.
--
-- This SECURITY DEFINER RPC derives appeal_by from auth.uid() against the
-- order's buyer_id / seller_id, gates on status='resolved', and bypasses RLS
-- to flip status back to 'disputed'.
CREATE OR REPLACE FUNCTION public.submit_order_appeal(
  p_order_id uuid,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_role     text;
  v_buyer    uuid;
  v_seller   uuid;
  v_status   text;
  v_appealed timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF length(coalesce(btrim(p_reason), '')) < 20 THEN
    RAISE EXCEPTION 'appeal reason too short';
  END IF;

  SELECT buyer_id, seller_id, status, appealed_at
    INTO v_buyer, v_seller, v_status, v_appealed
    FROM public.orders
    WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_status <> 'resolved' THEN
    RAISE EXCEPTION 'order is not in a resolved state';
  END IF;

  IF v_appealed IS NOT NULL THEN
    RAISE EXCEPTION 'order has already been appealed';
  END IF;

  IF v_caller = v_buyer THEN
    v_role := 'buyer';
  ELSIF v_caller = v_seller THEN
    v_role := 'seller';
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.orders
  SET status        = 'disputed',
      appealed_at   = NOW(),
      appeal_by     = v_role,
      appeal_reason = btrim(p_reason)
  WHERE id = p_order_id
    AND status = 'resolved';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_order_appeal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_order_appeal(uuid, text) TO authenticated;
