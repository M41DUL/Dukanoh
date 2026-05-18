-- Public web deletion request queue. Captures requests submitted via the
-- /account-deletion page on dukanoh-web by users who cannot delete from the
-- app (lost device, can't sign in, etc.). Required for Google Play's
-- account deletion policy and our published 7-day SLA.
--
-- This is a compliance-grade queue, separate from the generic `feedback`
-- table: it tracks status, handled timestamp, and a free-text note for
-- audit purposes.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  message       TEXT,                                         -- optional note from the user
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'handled')),
  handled_at    TIMESTAMPTZ,
  handled_note  TEXT,                                         -- admin's audit note ("Deleted via RPC, emailed user")
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Anon users can insert via the public web form. No SELECT for anon — admin
-- only reads happen via the service role.
CREATE POLICY "Anon can submit deletion requests"
  ON public.account_deletion_requests FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated can submit deletion requests"
  ON public.account_deletion_requests FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_acct_del_req_status_created
  ON public.account_deletion_requests (status, created_at DESC);


-- Extend the admin nav counts RPC with the pending deletion count.
CREATE OR REPLACE FUNCTION public.get_admin_nav_counts()
RETURNS TABLE (
  disputes_count          INT,
  reports_count           INT,
  stuck_paid              INT,
  stuck_shipped           INT,
  old_disputes            INT,
  account_deletion_count  INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'disputed')                                              AS disputes_count,
    (SELECT COUNT(*)::INT FROM public.reports WHERE status = 'pending')                                              AS reports_count,
    (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'paid'     AND created_at  < NOW() - INTERVAL '3 days')  AS stuck_paid,
    (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'shipped'  AND shipped_at  < NOW() - INTERVAL '14 days') AS stuck_shipped,
    (SELECT COUNT(*)::INT FROM public.orders WHERE status = 'disputed' AND disputed_at < NOW() - INTERVAL '7 days')  AS old_disputes,
    (SELECT COUNT(*)::INT FROM public.account_deletion_requests WHERE status = 'pending')                            AS account_deletion_count;
$$;

REVOKE ALL ON FUNCTION public.get_admin_nav_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_nav_counts() TO service_role;
