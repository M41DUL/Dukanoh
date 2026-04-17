-- confirm_order_receipt RPC
-- Uses server-side NOW() for delivered_at and completed_at, eliminating device
-- clock skew. Enforces the shipped→completed guard at DB level.
CREATE OR REPLACE FUNCTION public.confirm_order_receipt(
  p_order_id UUID,
  p_buyer_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.orders
  SET
    status       = 'completed',
    delivered_at = NOW(),
    completed_at = NOW()
  WHERE
    id       = p_order_id
    AND buyer_id = p_buyer_id
    AND status   = 'shipped';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
