-- Dispatch deadline enforcement.
-- Adds dispatch_deadline_at to orders: set automatically 5 days after payment is confirmed.
-- auto-cancel-unverified-orders edge function is extended to cancel and refund overdue orders.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_deadline_at TIMESTAMPTZ;

-- Trigger: when an order transitions to 'paid', stamp the 5-day dispatch deadline.
CREATE OR REPLACE FUNCTION public.set_dispatch_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    NEW.dispatch_deadline_at := NOW() + INTERVAL '5 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_dispatch_deadline ON public.orders;
CREATE TRIGGER trg_set_dispatch_deadline
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_dispatch_deadline();
