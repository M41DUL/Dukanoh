-- Harden disputes, refunds, and money release.
--
-- 1. is_destination_charge: marks orders whose money was routed to the seller's
--    Connect account at charge time (verified sellers). Refund paths use it to
--    decide whether to reverse the seller's transfer (clawback).
-- 2. Move order status changes (raise/withdraw dispute, cancel) into
--    SECURITY DEFINER RPCs with from-state guards, then DROP the broad
--    buyer/seller UPDATE policies so status can no longer be written directly via
--    the API (which allowed illegal transitions like completed->disputed and
--    skipped refund/relist side effects).
-- 3. Release guard: never move funds to available while an appeal is pending or
--    its window is still open (belt-and-suspenders over the status='completed' gate).

-- 1. Destination-charge marker ----------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_destination_charge BOOLEAN NOT NULL DEFAULT FALSE;

-- 2a. RPC: raise a dispute (buyer only, shipped/delivered) -------------------
CREATE OR REPLACE FUNCTION public.raise_dispute(p_order_id UUID, p_reason TEXT, p_description TEXT)
RETURNS void AS $$
DECLARE v_rows INT;
BEGIN
  UPDATE public.orders
  SET status = 'disputed', dispute_reason = p_reason,
      dispute_description = p_description, disputed_at = NOW()
  WHERE id = p_order_id
    AND buyer_id = auth.uid()
    AND status IN ('shipped','delivered');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Order cannot be disputed in its current state'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL    ON FUNCTION public.raise_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_dispute(uuid, text, text) TO authenticated;

-- 2b. RPC: withdraw a dispute (buyer only, disputed -> completed) ------------
CREATE OR REPLACE FUNCTION public.withdraw_dispute(p_order_id UUID)
RETURNS void AS $$
DECLARE v_rows INT;
BEGIN
  UPDATE public.orders
  SET status = 'completed', delivered_at = COALESCE(delivered_at, NOW()), completed_at = NOW()
  WHERE id = p_order_id
    AND buyer_id = auth.uid()
    AND status = 'disputed';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'No disputed order to withdraw'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL    ON FUNCTION public.withdraw_dispute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_dispute(uuid) TO authenticated;

-- 2c. RPC: cancel an order (buyer or seller; refund is issued separately by the
--     client via the stripe-refund edge function BEFORE calling this). Handles
--     the state transition + relist + seller strike atomically. -------------
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID, p_cancelled_by TEXT)
RETURNS void AS $$
DECLARE v_order public.orders; v_rows INT;
BEGIN
  IF p_cancelled_by NOT IN ('buyer','seller') THEN RAISE EXCEPTION 'invalid canceller'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF p_cancelled_by = 'buyer'  AND v_order.buyer_id  IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_cancelled_by = 'seller' AND v_order.seller_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not allowed'; END IF;

  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_cancelled_by
  WHERE id = p_order_id AND status IN ('paid','shipped');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'order not cancellable in its current state'; END IF;

  IF v_order.listing_id IS NOT NULL THEN
    UPDATE public.listings SET status = 'available', buyer_id = NULL, sold_at = NULL
    WHERE id = v_order.listing_id;
  END IF;

  IF p_cancelled_by = 'seller' THEN
    INSERT INTO public.cancellation_strikes (seller_id, order_id) VALUES (v_order.seller_id, p_order_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL    ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

-- 2d. NOTE: the orders RLS UPDATE policies are dropped in a SEPARATE, deferred
-- migration (..._lock_orders_status_writes.sql) applied only AFTER an app build
-- with the RPC-based mutations ships. Dropping them before that build would break
-- dispute/withdraw/cancel in the currently-installed app (it still does direct
-- UPDATEs). The RPCs above are additive and safe to apply now.

-- 3. Release guard: don't release funds while contested ----------------------
CREATE OR REPLACE FUNCTION public.release_cleared_wallet_funds()
RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, seller_id, item_price, protection_fee
    FROM public.orders
    WHERE status = 'completed'
      AND wallet_released_at IS NULL
      -- never release while an appeal is pending or its window is still open
      AND appealed_at IS NULL
      AND (appeal_deadline_at IS NULL OR appeal_deadline_at <= NOW())
      AND (
        funds_available_on <= NOW()
        OR (funds_available_on IS NULL AND completed_at < NOW() - INTERVAL '14 days')
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.seller_wallet
    SET pending_balance   = GREATEST(0, pending_balance - r.item_price),
        available_balance = available_balance + r.item_price,
        lifetime_earned   = lifetime_earned + r.item_price,
        updated_at        = NOW()
    WHERE seller_id = r.seller_id;

    INSERT INTO public.platform_ledger (order_id, fee_type, amount)
    VALUES (r.id, 'buyer_protection', r.protection_fee)
    ON CONFLICT (order_id) DO NOTHING;

    UPDATE public.orders SET wallet_released_at = NOW() WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
