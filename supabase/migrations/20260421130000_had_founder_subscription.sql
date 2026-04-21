-- Permanent flag set when a founder subscription is cancelled or expires.
-- Prevents re-subscription at founder pricing after cancellation.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS had_founder_subscription BOOLEAN NOT NULL DEFAULT FALSE;
