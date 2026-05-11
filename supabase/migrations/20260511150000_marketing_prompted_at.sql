-- marketing_prompted_at — set when we have asked the user about marketing
-- notifications (either via the email signup checkbox or the in-app sheet
-- shown to social-signup users on their second session). Null means we
-- have never asked, which is the gate for showing the in-app sheet.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS marketing_prompted_at TIMESTAMPTZ;
