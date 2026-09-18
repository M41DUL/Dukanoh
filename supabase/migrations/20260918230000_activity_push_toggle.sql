-- Activity notifications (someone saved your listing, a new review, a price
-- drop on a saved piece) get their own on/off switch (Privacy §6). Orders and
-- messages stay always-on in the app; marketing keeps marketing_push_consent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS activity_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.users.activity_push_enabled IS
  'Settings → Notifications → Activity. push-notification skips save/review/price-drop pushes when FALSE.';

-- Members may flip their own switch (column-level allowlist; see users_column_allowlist).
GRANT UPDATE (activity_push_enabled) ON public.users TO authenticated;
