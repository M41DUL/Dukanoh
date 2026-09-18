-- Remind the buyer the day before an order auto-completes.
--
-- WHY: mark_order_shipped() sets auto_release_at = NOW() + 7 days. If the buyer
-- never taps "Item received" or reports a problem, auto_release_orders() (hourly)
-- completes the order and releases payment to the seller with no warning. The
-- Terms (clause 5) and the Legal page now promise a reminder before that happens.
--
-- HOW: an hourly cron finds 'shipped' orders whose auto_release_at is within the
-- next 25 hours (one-hour overlap so no order falls between runs), stamps
-- auto_release_reminder_sent_at, and POSTs one AUTO_RELEASE_REMINDER event per
-- order to the push-notification edge function through pg_net, using the same
-- Vault secrets as the auto-cancel cron (supabase_url + INTERNAL_API_KEY).
-- push-notification accepts x-dukanoh-key = INTERNAL_API_KEY for this path.
--
-- Only 'shipped' orders are reminded: once the buyer taps "Item received" the
-- order is 'delivered' and the buyer chose to start the 48-hour window.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS auto_release_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.auto_release_reminder_sent_at IS
  'When the buyer was reminded that the order completes in ~24h (shipped orders only). NULL = not yet reminded.';

CREATE OR REPLACE FUNCTION public.remind_auto_release_orders()
RETURNS void AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
  r RECORD;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_API_KEY';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'remind_auto_release_orders: vault secrets supabase_url / INTERNAL_API_KEY missing; no reminders sent';
    RETURN;
  END IF;

  FOR r IN
    UPDATE public.orders o
    SET auto_release_reminder_sent_at = NOW()
    WHERE o.status = 'shipped'
      AND o.auto_release_at IS NOT NULL
      AND o.auto_release_at > NOW()
      AND o.auto_release_at <= NOW() + INTERVAL '25 hours'
      AND o.auto_release_reminder_sent_at IS NULL
    RETURNING o.id, o.buyer_id, o.seller_id, o.listing_id, o.status, o.auto_release_at
  LOOP
    PERFORM net.http_post(
      url := v_url || '/functions/v1/push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dukanoh-key', v_key
      ),
      body := jsonb_build_object(
        'type', 'AUTO_RELEASE_REMINDER',
        'table', 'orders',
        'record', jsonb_build_object(
          'id', r.id,
          'buyer_id', r.buyer_id,
          'seller_id', r.seller_id,
          'listing_id', r.listing_id,
          'status', r.status,
          'auto_release_at', r.auto_release_at
        )
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cron-only: never callable from the app.
REVOKE ALL    ON FUNCTION public.remind_auto_release_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remind_auto_release_orders() TO postgres;

-- Guarded: cron.unschedule throws if the job is absent (fresh DB / CI run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-auto-release-orders') THEN
    PERFORM cron.unschedule('remind-auto-release-orders');
  END IF;
END $$;

-- Runs at :30 each hour, offset from auto-release-orders (:00) so an order is
-- never reminded and completed in the same minute.
SELECT cron.schedule(
  'remind-auto-release-orders',
  '30 * * * *',
  'SELECT public.remind_auto_release_orders()'
);
