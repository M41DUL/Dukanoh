-- Aggregate-only feedback captured during account deletion. Stored without
-- a user_id so the feedback survives anonymization without becoming a
-- back-door for re-identification. The delete-account Edge Function inserts
-- one row per deletion that included a reason; deletions without a reason
-- (user skipped) record nothing.

CREATE TABLE IF NOT EXISTS public.deletion_feedback (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  reason_code  TEXT        NOT NULL
               CHECK (reason_code IN (
                 'not_finding',
                 'bad_experience',
                 'privacy',
                 'notifications',
                 'other'
               )),
  reason_text  TEXT,           -- optional free-text; surfaced only for 'other' in the UI
  occurred_at  TIMESTAMPTZ    DEFAULT NOW()
);

ALTER TABLE public.deletion_feedback ENABLE ROW LEVEL SECURITY;
-- No policies: service role only. The Edge Function uses the service role
-- key to insert; reads happen via the Supabase dashboard.

CREATE INDEX IF NOT EXISTS idx_deletion_feedback_occurred_at
  ON public.deletion_feedback (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_feedback_reason_code
  ON public.deletion_feedback (reason_code);
