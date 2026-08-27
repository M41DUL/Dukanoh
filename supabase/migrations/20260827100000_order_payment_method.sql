-- Record how the buyer paid, so an order can say so after the fact.
--
-- The success screen names the payment method at the moment of purchase, but it
-- reads that from the checkout call and nothing persists it. Open the same order
-- a week later and there is no way to tell whether it was a wallet or a card —
-- which is the first thing people check on a receipt.
--
-- Written by whichever path confirms the payment (stripe-webhook normally,
-- reconcile-stale-payments when the webhook is missed), derived from the
-- charge's payment_method_details.card.wallet.type. Orders that predate this
-- column stay NULL and the order screen simply omits the row.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('card', 'google_pay', 'apple_pay'));

COMMENT ON COLUMN public.orders.payment_method IS
  'How the buyer paid: card | google_pay | apple_pay. Derived from the Stripe charge''s wallet type at confirmation. NULL for orders created before this column existed.';
