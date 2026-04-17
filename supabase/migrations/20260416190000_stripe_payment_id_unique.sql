-- Add unique constraint to stripe_payment_id on orders
-- Prevents duplicate orders if both client and webhook race to insert for the same payment
ALTER TABLE public.orders
  ADD CONSTRAINT orders_stripe_payment_id_unique UNIQUE (stripe_payment_id);
