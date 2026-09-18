-- Claude engine — 2026-09-18.
--
-- 1. Private storage bucket for Dukanoh Fit training photos, replacing the
--    AWS S3 bucket. No storage policies on purpose: only the service role
--    (store-training-image) can read or write it.
-- 2. recognition_model setting alongside recognition_engine, so the model
--    tier is a row edit, not a deploy. Haiku 4.5 by default per the cost
--    decision; the scoreboard says whether a step up earns its keep.
-- 3. Room for the richer read Claude gives (accent colours, embellishment)
--    on both the event log and the dataset, and the model that produced it.

INSERT INTO storage.buckets (id, name, public)
VALUES ('fit-training', 'fit-training', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES ('recognition_model', 'claude-haiku-4-5')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.recognition_events
  ADD COLUMN IF NOT EXISTS model      TEXT,
  ADD COLUMN IF NOT EXISTS attributes JSONB;

ALTER TABLE public.garment_labels
  ADD COLUMN IF NOT EXISTS predicted_model TEXT,
  ADD COLUMN IF NOT EXISTS attributes      JSONB;

COMMENT ON COLUMN public.garment_labels.attributes IS
  'Engine read at confirmation time: { accentColours: string[], embellishment: none|light|heavy }.';
COMMENT ON COLUMN public.recognition_events.attributes IS
  'Extra attributes the engine returned beyond the contract (accent colours, embellishment).';

-- A model may decline to look at a photo. That is its own outcome, not an
-- outage: recognition answers "not listable", moderation answers "blocked".
ALTER TABLE public.recognition_events DROP CONSTRAINT IF EXISTS recognition_events_outcome_check;
ALTER TABLE public.recognition_events
  ADD CONSTRAINT recognition_events_outcome_check CHECK (outcome IN ('ok', 'unavailable', 'refused'));
