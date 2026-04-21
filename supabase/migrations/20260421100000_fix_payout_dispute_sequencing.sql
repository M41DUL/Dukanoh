-- Fix payout/dispute sequencing: the 48-hour dispute window must fully close
-- before funds move to available_balance.
--
-- Previous behaviour: auto_release_at was set at shipping time (shipped_at + 2 days),
-- so the payout clock and the dispute window ran concurrently from the same point.
-- On fast deliveries, sellers could be paid before the buyer had a realistic chance
-- to inspect the item and raise a dispute.
--
-- New behaviour:
--   • mark_order_shipped   → auto_release_at = shipped_at + 7 days (fallback only;
--                            covers ~5 days estimated delivery + 2 days dispute window)
--   • confirm_order_receipt→ moves order to 'delivered', resets
--                            auto_release_at = delivered_at + 2 days
--   • auto_release_orders  → handles both 'shipped' (fallback) and 'delivered' paths

-- 1. mark_order_shipped: extend fallback release window to 7 days
CREATE OR REPLACE FUNCTION public.mark_order_shipped(
  p_order_id  UUID,
  p_seller_id UUID,
  p_tracking  TEXT,
  p_courier   TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET
    status          = 'shipped',
    tracking_number = p_tracking,
    courier         = p_courier,
    shipped_at      = NOW(),
    auto_release_at = NOW() + INTERVAL '7 days'
  WHERE
    id        = p_order_id
    AND seller_id = p_seller_id
    AND status    = 'paid';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. confirm_order_receipt: shipped → delivered, starts 48-hour dispute clock
CREATE OR REPLACE FUNCTION public.confirm_order_receipt(
  p_order_id UUID,
  p_buyer_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET
    status          = 'delivered',
    delivered_at    = NOW(),
    auto_release_at = NOW() + INTERVAL '2 days'
  WHERE
    id       = p_order_id
    AND buyer_id = p_buyer_id
    AND status   = 'shipped';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. auto_release_orders: handle both shipped (fallback) and delivered paths
CREATE OR REPLACE FUNCTION public.auto_release_orders()
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET status = 'completed', completed_at = NOW()
  WHERE status IN ('shipped', 'delivered')
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
