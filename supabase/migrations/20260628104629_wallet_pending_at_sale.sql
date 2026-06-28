-- Wallet model v2 — pending at sale, available only when completed AND cleared.
--
-- OLD: pending credited at SHIP; available credited at COMPLETION, with no regard
-- for Stripe fund clearing — so the wallet could show "available" money that
-- wasn't actually withdrawable yet (Stripe hadn't released the funds).
--
-- NEW:
--   * item_price enters PENDING when the order is paid (the sale).
--   * It moves to AVAILABLE only once the order is COMPLETED (buyer-protection
--     window passed) AND Stripe has cleared the charge (funds_available_on).
-- This keeps the buyer-protection hold and makes "available" a true
-- "withdrawable" signal. Only item_price is tracked (platform keeps the fee).

-- 1. New columns -------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS funds_available_on TIMESTAMPTZ,  -- Stripe charge clear date (from stripe-webhook)
  ADD COLUMN IF NOT EXISTS wallet_released_at TIMESTAMPTZ;  -- set once pending->available has happened

-- 2. Rewrite the wallet trigger ---------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_wallet_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Money enters PENDING when the sale is confirmed (paid).
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.seller_wallet
    SET pending_balance = pending_balance + NEW.item_price, updated_at = NOW()
    WHERE seller_id = NEW.seller_id;
  END IF;

  -- Money leaves PENDING if a not-yet-released order is cancelled. We only
  -- decrement for prior states that had been counted in pending (paid onward);
  -- reservation 'pending' and 'created' never added to the wallet.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.wallet_released_at IS NULL
     AND OLD.status IN ('paid','shipped','delivered','disputed','resolved') THEN
    UPDATE public.seller_wallet
    SET pending_balance = GREATEST(0, pending_balance - NEW.item_price), updated_at = NOW()
    WHERE seller_id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS order_wallet_update ON public.orders;
CREATE TRIGGER order_wallet_update
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_wallet_update();

-- 3. Release function: pending -> available when completed AND cleared --------
-- Run by cron. Releases an order only when it is completed AND its funds have
-- cleared. The wallet_released_at guard makes it run exactly once per order. The
-- NULL-clear-date branch is a no-stranding safety net: if we never captured a
-- clear date, release anyway 14 days after completion.
CREATE OR REPLACE FUNCTION public.release_cleared_wallet_funds()
RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, seller_id, item_price, protection_fee
    FROM public.orders
    WHERE status = 'completed'
      AND wallet_released_at IS NULL
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

REVOKE ALL    ON FUNCTION public.release_cleared_wallet_funds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cleared_wallet_funds() TO postgres;

-- 4. Index for the release scan ---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_pending_release
  ON public.orders (status, funds_available_on)
  WHERE wallet_released_at IS NULL;

-- 5. Cron: release every 15 minutes -----------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-cleared-wallet-funds') THEN
    PERFORM cron.unschedule('release-cleared-wallet-funds');
  END IF;
END $$;
SELECT cron.schedule('release-cleared-wallet-funds', '*/15 * * * *', 'SELECT public.release_cleared_wallet_funds()');

-- 6. Reconcile existing orders ----------------------------------------------
-- Snapshot at migration time: only 'completed' and 'cancelled' orders exist (no
-- paid/shipped/delivered/disputed/resolved) -> pending is already 0, no backfill
-- needed. Completed orders are already in available under the old trigger; stamp
-- them released so the new job never re-pays them (and never resurrects funds
-- that have since been withdrawn).
UPDATE public.orders
SET wallet_released_at = COALESCE(completed_at, NOW())
WHERE status = 'completed' AND wallet_released_at IS NULL;
