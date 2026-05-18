-- Add three new feedback categories (legal, privacy, appeals) so the
-- /support form on dukanoh-web can offer pre-routed topic pills that
-- replace the formerly-listed legal@ / privacy@ / appeals@ email aliases.
-- Existing rows are unaffected (the CHECK only restricts future inserts).

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_type_check
  CHECK (type IN ('bug', 'feature', 'general', 'support', 'legal', 'privacy', 'appeals'));
