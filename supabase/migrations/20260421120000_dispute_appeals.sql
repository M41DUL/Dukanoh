-- Dispute resolution metadata and 7-day appeals window (T&C clause 13.2)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS resolution_outcome   TEXT,        -- 'release_seller' | 'refund_buyer'
  ADD COLUMN IF NOT EXISTS resolution_note      TEXT,        -- admin explanation shown to both parties
  ADD COLUMN IF NOT EXISTS resolved_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_deadline_at   TIMESTAMPTZ, -- resolved_at + 7 days
  ADD COLUMN IF NOT EXISTS appealed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_by            TEXT,        -- 'buyer' | 'seller'
  ADD COLUMN IF NOT EXISTS appeal_reason        TEXT;

-- Extend auto_release_orders to settle resolved orders after the appeal window closes.
-- release_seller → completed (wallet trigger fires the credit)
-- refund_buyer   → stays resolved (refund already issued by admin; terminal)
CREATE OR REPLACE FUNCTION public.auto_release_orders()
RETURNS void AS $$
BEGIN
  -- Normal delivery auto-release (shipped / delivered → completed)
  UPDATE public.orders
  SET status = 'completed', completed_at = NOW()
  WHERE status IN ('shipped', 'delivered')
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();

  -- Settle resolved disputes where appeal window has passed and no appeal filed
  UPDATE public.orders
  SET status = 'completed', completed_at = NOW()
  WHERE status = 'resolved'
    AND resolution_outcome = 'release_seller'
    AND appeal_deadline_at IS NOT NULL
    AND appeal_deadline_at <= NOW()
    AND appealed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
