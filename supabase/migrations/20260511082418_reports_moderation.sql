-- Reports moderation queue
-- Adds triage state to existing reports table so admin can mark
-- reports as dismissed (false alarm) or actioned (handled in Supabase).
-- Mobile app only inserts into reports; these defaulted columns are safe.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dismissed', 'actioned')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS reports_status_idx     ON public.reports (status);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_listing_id_idx ON public.reports (listing_id);
