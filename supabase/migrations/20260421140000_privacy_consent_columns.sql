-- Per-user privacy consent preferences.
-- analytics_consent    — Firebase / analytics SDKs (default true; user can opt out)
-- marketing_consent    — personalisation and retargeting (default false; explicit opt-in)
-- marketing_push_consent — marketing push notifications, regulated separately under PECR (default false)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS analytics_consent       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS marketing_consent       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_push_consent  BOOLEAN NOT NULL DEFAULT FALSE;
