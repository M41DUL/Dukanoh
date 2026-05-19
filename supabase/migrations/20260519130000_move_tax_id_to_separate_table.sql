-- Move sensitive tax identifiers out of public.users.
--
-- public.users has a SELECT policy of USING (true) so every authenticated
-- caller could read every seller's NI / UTR via PostgREST. Move the actual
-- identifier and its type into a dedicated table with auth.uid() = user_id
-- RLS to close that leak.
--
-- The timestamps (tax_id_collected_at, tax_declaration_at) stay on users.
-- They are not PII and several call sites read them without needing the
-- identifier itself (useTaxStatus, the order-tax-threshold trigger, the
-- admin_update_user_flags RPC, the admin account-flags screen).

CREATE TABLE IF NOT EXISTS public.user_tax_info (
  user_id        UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tax_id_type    TEXT,    -- 'NI' or 'UTR'
  tax_id_number  TEXT,    -- NI number or UTR
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill from existing user rows.
INSERT INTO public.user_tax_info (user_id, tax_id_type, tax_id_number)
SELECT id, tax_id_type, tax_id_number
FROM public.users
WHERE tax_id_number IS NOT NULL OR tax_id_type IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Drop the leaked columns from users.
ALTER TABLE public.users
  DROP COLUMN IF EXISTS tax_id_type,
  DROP COLUMN IF EXISTS tax_id_number;

ALTER TABLE public.user_tax_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tax info"
  ON public.user_tax_info FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own tax info"
  ON public.user_tax_info FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own tax info"
  ON public.user_tax_info FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
