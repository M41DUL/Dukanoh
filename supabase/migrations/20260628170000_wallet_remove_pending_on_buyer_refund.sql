-- Fix: a dispute resolved FOR THE BUYER (refund_buyer) left the amount stuck in
-- the seller's pending_balance. The order goes to 'resolved' (not 'cancelled'),
-- and neither the wallet trigger (only acted on ->cancelled) nor the release
-- function (only acts on 'completed') removed it -> pending overstated forever.
-- (No money loss: it never reaches available, so it can't be withdrawn — but the
-- seller's wallet showed money they will never get.)
--
-- Add a branch: when a dispute resolves refund_buyer, remove the amount from
-- pending. Guarded on OLD.resolution_outcome so it fires once, even across
-- appeal re-resolutions (submit_order_appeal keeps resolution_outcome).
CREATE OR REPLACE FUNCTION public.handle_order_wallet_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Sale confirmed -> money enters pending.
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.seller_wallet
    SET pending_balance = pending_balance + NEW.item_price, updated_at = NOW()
    WHERE seller_id = NEW.seller_id;
  END IF;
  -- Cancelled before release -> remove from pending.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.wallet_released_at IS NULL
     AND OLD.status IN ('paid','shipped','delivered','disputed','resolved') THEN
    UPDATE public.seller_wallet
    SET pending_balance = GREATEST(0, pending_balance - NEW.item_price), updated_at = NOW()
    WHERE seller_id = NEW.seller_id;
  END IF;
  -- Dispute resolved FOR THE BUYER -> seller won't be paid; remove from pending.
  IF NEW.status = 'resolved' AND NEW.resolution_outcome = 'refund_buyer'
     AND OLD.resolution_outcome IS DISTINCT FROM 'refund_buyer'
     AND NEW.wallet_released_at IS NULL THEN
    UPDATE public.seller_wallet
    SET pending_balance = GREATEST(0, pending_balance - NEW.item_price), updated_at = NOW()
    WHERE seller_id = NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
