-- Store seller declaration timestamp for HMRC due-diligence evidence.
-- Recorded each time a seller submits or updates their tax information.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tax_declaration_at TIMESTAMPTZ;
