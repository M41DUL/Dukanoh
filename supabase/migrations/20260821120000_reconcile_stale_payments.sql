-- Stop the stale-reservation sweep from cancelling orders that were actually paid.
--
-- BUG: checkout reserves a listing with a 'pending' order BEFORE charging, and
--   stripe-webhook flips it to 'paid' afterwards. cancel_stale_pending_orders()
--   cancels every 'pending' order older than 20 minutes and relists the item —
--   with no way to tell an abandoned checkout from a completed payment whose
--   webhook is late. When the webhook then arrives it finds no reservation,
--   treats the payment as orphaned and auto-refunds it. The buyer's money comes
--   back, but a real purchase disappears: the buyer loses the item they bought
--   and the seller loses the sale, with nothing to explain it to either.
--
-- FIX: record the PaymentIntent on the reservation, so a reservation that
--   reached Stripe is distinguishable from one that never did.
--     • SQL sweep  → only reservations that never reached Stripe (no PI).
--       Nothing was ever charged for these, so cancelling is always safe.
--     • Edge fn    → everything that did reach Stripe. reconcile-stale-payments
--       asks Stripe for the real status and confirms, cancels, or leaves it
--       alone accordingly.
--
-- Existing rows have a NULL reserved_payment_intent_id and so keep falling to
-- the SQL sweep exactly as before — no backfill needed.
--
-- PREREQUISITE (set out-of-band — secrets must not live in version control):
-- the same two Vault secrets the auto-cancel cron already uses:
--   • supabase_url      = https://<project-ref>.supabase.co
--   • INTERNAL_API_KEY  = matches the edge function's INTERNAL_API_KEY secret
--                         (checked against the x-dukanoh-key header).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reserved_payment_intent_id TEXT;

COMMENT ON COLUMN public.orders.reserved_payment_intent_id IS
  'PaymentIntent created for this reservation, written by create-payment-intent before the buyer pays. Marks "this reservation reached Stripe" — NOT proof of payment. Payment is recorded in stripe_payment_id, which only ever gets written once the charge is confirmed.';

-- Partial index for the reconciler''s only query: stale pending reservations
-- that have a PaymentIntent to look up.
CREATE INDEX IF NOT EXISTS idx_orders_pending_reservations
  ON public.orders (created_at)
  WHERE status = 'pending' AND reserved_payment_intent_id IS NOT NULL;

-- Sweep now handles only the reservations that never reached Stripe.
CREATE OR REPLACE FUNCTION public.cancel_stale_pending_orders()
RETURNS void AS $$
BEGIN
  WITH stale AS (
    UPDATE public.orders
    SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'system'
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '20 minutes'
      -- Never touch a reservation that reached Stripe: it may have been paid,
      -- and only reconcile-stale-payments can tell. See this migration's header.
      AND reserved_payment_intent_id IS NULL
    RETURNING listing_id
  )
  UPDATE public.listings
  SET status = 'available', buyer_id = NULL, sold_at = NULL
  WHERE id IN (SELECT listing_id FROM stale WHERE listing_id IS NOT NULL)
    AND status <> 'available';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_stale_pending_orders() TO postgres;

-- Every 15 minutes: reconcile the reservations the SQL sweep can no longer
-- safely judge. More frequent than the hourly auto-cancel job because a listing
-- stays locked until this runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-stale-payments') THEN
    PERFORM cron.unschedule('reconcile-stale-payments');
  END IF;
END $$;

SELECT cron.schedule(
  'reconcile-stale-payments',
  '*/15 * * * *',
  $cmd$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/reconcile-stale-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dukanoh-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INTERNAL_API_KEY')
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
