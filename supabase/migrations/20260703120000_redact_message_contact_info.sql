-- Silently redact contact info from chat messages to reduce off-platform
-- leakage. Runs BEFORE INSERT so the scrubbed content also flows into
-- conversations.last_message via the existing on_message_inserted trigger.
-- Originals are kept in an admin-only table for moderation and regex tuning.

-- Pure helper: returns message content with emails, platform/payment keywords,
-- @handles and phone numbers replaced by [hidden].
CREATE OR REPLACE FUNCTION public.redact_contact_info(txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    txt,
    -- emails
    '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[hidden]', 'gi'),
    -- platform / payment keywords (word-bounded so "insta" != "instant")
    '\y(whats\s?app|wtsapp|watsapp|instagram|insta|telegram|snapchat|paypal|venmo|cashapp|revolut|monzo|iban|bank\s+transfer|sort\s+code)\y', '[hidden]', 'gi'),
    -- @handles
    '@[[:alnum:]._]{2,}', '[hidden]', 'g'),
    -- UK mobile / +44, spacing-tolerant and anchored to the prefix
    '(\+?4[[:space:].()-]*4|0[[:space:].()-]*0[[:space:].()-]*4[[:space:].()-]*4|0)[[:space:].()-]*7([[:space:].()-]*[[:digit:]]){9}', '[hidden]', 'g'),
    -- UK landline (0 + 1/2/3 area code)
    '0[[:space:].()-]*[123]([[:space:].()-]*[[:digit:]]){8,9}', '[hidden]', 'g'),
    -- generic backstop: any run of 10+ digits (separators allowed)
    '[[:digit:]]([[:space:].()-]*[[:digit:]]){9,}', '[hidden]', 'g');
$$;

-- Admin-only store of pre-redaction originals. RLS enabled with NO policies =>
-- default-deny for anon/authenticated; only service_role (BYPASSRLS) can read.
CREATE TABLE IF NOT EXISTS public.message_redactions (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  message_id       UUID REFERENCES public.messages (id) ON DELETE CASCADE NOT NULL,
  original_content TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_redactions_message ON public.message_redactions (message_id);
ALTER TABLE public.message_redactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_redactions FROM anon, authenticated;

-- BEFORE INSERT trigger: scrub content, stash the original if anything changed.
CREATE OR REPLACE FUNCTION public.redact_message_content()
RETURNS TRIGGER AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := public.redact_contact_info(NEW.content);
  IF v_clean IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.message_redactions (message_id, original_content)
    VALUES (NEW.id, NEW.content);
    NEW.content := v_clean;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_message_redact
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.redact_message_content();
