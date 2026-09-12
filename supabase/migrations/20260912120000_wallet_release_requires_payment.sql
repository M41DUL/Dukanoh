-- Wallet release: the 14-day no-stranding net must not invent money.
--
-- release_cleared_wallet_funds() moves an order's item_price from pending to
-- available. Normally it waits for funds_available_on (the date Stripe says the
-- charge clears). The second branch is a safety net for the case where we never
-- captured that date: release anyway once the order is 14 days old, so a missed
-- webhook can't strand a seller's money forever.
--
-- That net was too trusting. "No clear date" has two very different causes:
--
--   1. The payment happened, we just lost the notification. The money IS in
--      Stripe. Releasing it is correct — this is what the net is for.
--   2. There was never a payment at all. There is no money anywhere, and
--      releasing it credits a balance that cannot be paid out.
--
-- stripe_payment_id tells them apart: it is the Stripe receipt, written in the
-- same statement that flips an order to 'paid' (stripe-webhook, and the
-- reconcile-stale-payments catch-up). No receipt means no charge was ever made,
-- so require one before the net fires.
--
-- Case 2 is not hypothetical. Seller tafsi1 carried a £20 available balance from
-- a hand-made May test order with no stripe_payment_id; every withdrawal failed
-- with Stripe's balance_insufficient, surfaced to them as "your money hasn't
-- cleared yet — try again in a day or two", which would never come true.
--
-- This cannot block a legitimate order: both paths that mark an order paid write
-- stripe_payment_id and funds_available_on together, and funds_available_on
-- always gets a value (falling back to +7 days), so a real order reaches the
-- first branch and never depends on the net at all. Verified against all 37
-- orders at the time of writing: this changes the outcome for the one bad row.
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
        OR (
          funds_available_on IS NULL
          -- no Stripe receipt = no charge = no money to release
          AND stripe_payment_id IS NOT NULL
          AND completed_at < NOW() - INTERVAL '14 days'
        )
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
