-- Track bank chargebacks (buyer disputes via their card issuer, separate from
-- the in-app dispute flow). Set by the stripe-webhook charge.dispute.created
-- handler. NOTE: the webhook endpoint must be subscribed to charge.dispute.*
-- events in the Stripe dashboard for the handler to fire.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS chargeback_at TIMESTAMPTZ;
