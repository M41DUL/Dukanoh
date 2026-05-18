-- Threaded admin replies on the public `feedback` table. Powers the
-- /admin/feedback page on dukanoh-web: admins can reply to "Get in touch"
-- submissions, and user replies come back via a Resend inbound webhook
-- that inserts the inbound row.

-- ─── Status tracking on feedback ─────────────────────────────────────────────
-- open     — needs admin attention (new submission OR user has replied back)
-- replied  — admin sent the last message, waiting on user
-- closed   — admin marked the thread as done

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'replied', 'closed')),
  ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedback_status_created
  ON public.feedback (status, created_at DESC);


-- ─── feedback_replies: outbound + inbound thread ────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback_replies (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id   UUID        NOT NULL REFERENCES public.feedback (id) ON DELETE CASCADE,
  direction     TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  subject       TEXT,
  body_text     TEXT,
  body_html     TEXT,
  sender_email  TEXT        NOT NULL,
  sender_name   TEXT,
  resend_id     TEXT,                                       -- Resend's message id (outbound) or webhook event id (inbound)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; that's how the admin API route and the inbound
-- webhook function read/write. No anon/authenticated access.

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback_id
  ON public.feedback_replies (feedback_id, created_at);


-- ─── Extend admin nav counts RPC with open-feedback count ───────────────────
-- DROP first because the previous definition has a different table-return
-- signature, which CREATE OR REPLACE cannot change.

DROP FUNCTION IF EXISTS public.get_admin_nav_counts();

CREATE OR REPLACE FUNCTION public.get_admin_nav_counts()
RETURNS TABLE (
  disputes_count          INT,
  reports_count           INT,
  stuck_paid              INT,
  stuck_shipped           INT,
  old_disputes            INT,
  account_deletion_count  INT,
  feedback_count          INT
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
    (SELECT COUNT(*)::INT FROM public.account_deletion_requests WHERE status = 'pending')                            AS account_deletion_count,
    (SELECT COUNT(*)::INT FROM public.feedback WHERE status = 'open')                                                AS feedback_count;
$$;

REVOKE ALL ON FUNCTION public.get_admin_nav_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_nav_counts() TO service_role;
