-- Atomically zeroes a seller's available_balance and returns the amount that was there.
-- Used by stripe-payout to prevent race conditions where two concurrent requests
-- both read the same balance and trigger duplicate payouts.
--
-- SELECT ... FOR UPDATE locks the row for the duration of the transaction.
-- Concurrent calls block at the SELECT until the first completes; by then
-- available_balance is 0 so they return 0 and no duplicate payout fires.
CREATE OR REPLACE FUNCTION public.claim_available_balance(p_seller_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_amount NUMERIC;
BEGIN
  -- Lock the row first so concurrent calls queue behind this transaction
  SELECT available_balance INTO v_amount
  FROM public.seller_wallet
  WHERE seller_id = p_seller_id
    AND available_balance > 0
  FOR UPDATE;

  -- Nothing to claim (balance was 0 or already claimed by a concurrent request)
  IF v_amount IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.seller_wallet
  SET available_balance = 0
  WHERE seller_id = p_seller_id;

  RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
