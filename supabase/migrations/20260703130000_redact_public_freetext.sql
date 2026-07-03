-- Extend contact-info redaction to public free-text so sellers can't leak
-- contact/payment details in listing titles, descriptions or profile bios
-- (a bigger leak vector than chat: public and persistent). Reuses the same
-- redact_contact_info() helper as the messages trigger. BEFORE INSERT OR UPDATE
-- because these fields are editable; the OF clause means the trigger only fires
-- when the relevant column is actually being written.

CREATE OR REPLACE FUNCTION public.redact_listing_text()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.title := public.redact_contact_info(NEW.title);
  END IF;
  IF NEW.description IS NOT NULL THEN
    NEW.description := public.redact_contact_info(NEW.description);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER on_listing_redact
  BEFORE INSERT OR UPDATE OF title, description ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.redact_listing_text();

CREATE OR REPLACE FUNCTION public.redact_user_text()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bio IS NOT NULL THEN
    NEW.bio := public.redact_contact_info(NEW.bio);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER on_user_redact
  BEFORE INSERT OR UPDATE OF bio ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.redact_user_text();
