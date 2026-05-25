-- Issue grouping for crash reports.
--
-- The mobile app already inserts every unhandled error into public.app_errors
-- (see Dukanoh/lib/errorReporting.ts). This migration adds a stable
-- fingerprint per row and aggregates rows into public.app_error_issues —
-- one row per unique error — so the admin panel can triage and resolve
-- groups instead of swimming through raw events.
--
-- Phase 1 of the homegrown crash-reporting system. Search/FTS, source-map
-- symbolication, alerts, and release tracking land in follow-up migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- digest()


-- ─── Fingerprint column on app_errors ───────────────────────────────────────

ALTER TABLE public.app_errors
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

-- Supports the COUNT(DISTINCT user_id) recompute inside the AFTER trigger
-- and the per-issue timeline query on the detail page.
CREATE INDEX IF NOT EXISTS idx_app_errors_fingerprint_user
  ON public.app_errors (fingerprint, user_id);

CREATE INDEX IF NOT EXISTS idx_app_errors_fingerprint_created
  ON public.app_errors (fingerprint, created_at DESC);


-- ─── app_error_issues: one row per unique error ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_error_issues (
  fingerprint          TEXT        PRIMARY KEY,
  error_message        TEXT,
  first_seen           TIMESTAMPTZ,
  last_seen            TIMESTAMPTZ,
  event_count          INT         NOT NULL DEFAULT 0,
  affected_user_count  INT         NOT NULL DEFAULT 0,
  platforms            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  app_versions         TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  any_fatal            BOOLEAN     NOT NULL DEFAULT FALSE,
  status               TEXT        NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open','investigating','resolved','ignored')),
  notes                TEXT,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_error_issues ENABLE ROW LEVEL SECURITY;
-- No policies: service role (admin panel) bypasses RLS; no anon/auth access.

CREATE INDEX IF NOT EXISTS idx_app_error_issues_status_last_seen
  ON public.app_error_issues (status, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_issues_event_count
  ON public.app_error_issues (event_count DESC);

CREATE INDEX IF NOT EXISTS idx_app_error_issues_last_seen
  ON public.app_error_issues (last_seen DESC);


-- ─── Fingerprint computation ────────────────────────────────────────────────
-- Deterministic SHA-256 of (normalised first 2 stack frames) + first 80
-- chars of the message. Normalisation strips line/column numbers, bare
-- trailing line numbers, and hex addresses, then lowercases — so the same
-- minified crash always hashes to the same value regardless of run-to-run
-- variance.

CREATE OR REPLACE FUNCTION public.compute_error_fingerprint(
  msg   TEXT,
  stack TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  norm_msg    TEXT;
  norm_frames TEXT;
BEGIN
  norm_msg := lower(trim(substring(COALESCE(msg, ''), 1, 80)));

  IF stack IS NULL OR length(trim(stack)) = 0 THEN
    norm_frames := '';
  ELSE
    SELECT COALESCE(string_agg(trim(line), E'\n'), '')
    INTO norm_frames
    FROM (
      SELECT line
      FROM unnest(string_to_array(stack, E'\n')) WITH ORDINALITY AS s(line, idx)
      WHERE trim(line) <> ''
      ORDER BY idx
      LIMIT 2
    ) sub;
  END IF;

  -- Strip volatile bits: ":line:col", trailing ":line", hex addresses.
  norm_frames := regexp_replace(norm_frames, ':\d+:\d+',     '', 'g');
  norm_frames := regexp_replace(norm_frames, ':\d+',         '', 'g');
  norm_frames := regexp_replace(norm_frames, '0x[0-9a-f]+',  '', 'gi');
  norm_frames := lower(norm_frames);

  RETURN encode(digest(norm_msg || '|' || norm_frames, 'sha256'), 'hex');
END;
$$;


-- ─── BEFORE INSERT: stamp fingerprint onto the row ──────────────────────────

CREATE OR REPLACE FUNCTION public.app_errors_set_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fingerprint IS NULL THEN
    NEW.fingerprint := public.compute_error_fingerprint(NEW.error_message, NEW.stack_trace);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_errors_set_fingerprint_trg ON public.app_errors;
CREATE TRIGGER app_errors_set_fingerprint_trg
  BEFORE INSERT ON public.app_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.app_errors_set_fingerprint();


-- ─── AFTER INSERT: upsert the aggregate issue row ───────────────────────────
-- Increments event_count, extends arrays only with new values, recomputes
-- affected_user_count from scratch, and detects regressions (a previously
-- "resolved" issue flips back to "open" if the new event is more recent
-- than resolved_at).

CREATE OR REPLACE FUNCTION public.app_errors_aggregate_to_issues()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT;
BEGIN
  SELECT COUNT(DISTINCT user_id)::INT
  INTO affected
  FROM public.app_errors
  WHERE fingerprint = NEW.fingerprint
    AND user_id IS NOT NULL;

  INSERT INTO public.app_error_issues AS i (
    fingerprint,
    error_message,
    first_seen,
    last_seen,
    event_count,
    affected_user_count,
    platforms,
    app_versions,
    any_fatal,
    status
  )
  VALUES (
    NEW.fingerprint,
    NEW.error_message,
    NEW.created_at,
    NEW.created_at,
    1,
    affected,
    CASE WHEN NEW.platform    IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[NEW.platform]    END,
    CASE WHEN NEW.app_version IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[NEW.app_version] END,
    COALESCE(NEW.is_fatal, FALSE),
    'open'
  )
  ON CONFLICT (fingerprint) DO UPDATE
    SET
      last_seen           = GREATEST(i.last_seen, NEW.created_at),
      event_count         = i.event_count + 1,
      affected_user_count = affected,
      platforms           = CASE
                              WHEN NEW.platform IS NULL OR NEW.platform = ANY(i.platforms)
                                THEN i.platforms
                              ELSE array_append(i.platforms, NEW.platform)
                            END,
      app_versions        = CASE
                              WHEN NEW.app_version IS NULL OR NEW.app_version = ANY(i.app_versions)
                                THEN i.app_versions
                              ELSE array_append(i.app_versions, NEW.app_version)
                            END,
      any_fatal           = i.any_fatal OR COALESCE(NEW.is_fatal, FALSE),
      -- Regression detection
      status              = CASE
                              WHEN i.status = 'resolved'
                                AND NEW.created_at > COALESCE(i.resolved_at, '-infinity'::TIMESTAMPTZ)
                                THEN 'open'
                              ELSE i.status
                            END,
      resolved_at         = CASE
                              WHEN i.status = 'resolved'
                                AND NEW.created_at > COALESCE(i.resolved_at, '-infinity'::TIMESTAMPTZ)
                                THEN NULL
                              ELSE i.resolved_at
                            END,
      updated_at          = NOW();

  RETURN NULL;  -- AFTER trigger, return value ignored
END;
$$;

DROP TRIGGER IF EXISTS app_errors_aggregate_trg ON public.app_errors;
CREATE TRIGGER app_errors_aggregate_trg
  AFTER INSERT ON public.app_errors
  FOR EACH ROW
  EXECUTE FUNCTION public.app_errors_aggregate_to_issues();


-- ─── updated_at trigger on app_error_issues ─────────────────────────────────
-- Keeps updated_at fresh on every direct admin edit (status change, notes).
-- The aggregation trigger above already sets updated_at on every event.

CREATE OR REPLACE FUNCTION public.app_error_issues_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_error_issues_touch_updated_at_trg ON public.app_error_issues;
CREATE TRIGGER app_error_issues_touch_updated_at_trg
  BEFORE UPDATE ON public.app_error_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.app_error_issues_touch_updated_at();


-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Compute fingerprints for every existing app_errors row, then rebuild
-- app_error_issues from scratch in one aggregate query. Idempotent: safe to
-- re-run because the issue table is replaced wholesale.

UPDATE public.app_errors
SET fingerprint = public.compute_error_fingerprint(error_message, stack_trace)
WHERE fingerprint IS NULL;

TRUNCATE public.app_error_issues;

INSERT INTO public.app_error_issues (
  fingerprint,
  error_message,
  first_seen,
  last_seen,
  event_count,
  affected_user_count,
  platforms,
  app_versions,
  any_fatal,
  status,
  created_at,
  updated_at
)
SELECT
  e.fingerprint,
  -- Most recent message wins, so admins see the latest variant in the list.
  (SELECT error_message
     FROM public.app_errors
     WHERE fingerprint = e.fingerprint
     ORDER BY created_at DESC
     LIMIT 1),
  MIN(e.created_at),
  MAX(e.created_at),
  COUNT(*)::INT,
  COUNT(DISTINCT e.user_id)::INT,
  COALESCE(ARRAY_AGG(DISTINCT e.platform)    FILTER (WHERE e.platform    IS NOT NULL), ARRAY[]::TEXT[]),
  COALESCE(ARRAY_AGG(DISTINCT e.app_version) FILTER (WHERE e.app_version IS NOT NULL), ARRAY[]::TEXT[]),
  BOOL_OR(COALESCE(e.is_fatal, FALSE)),
  'open',
  NOW(),
  NOW()
FROM public.app_errors e
WHERE e.fingerprint IS NOT NULL
GROUP BY e.fingerprint;


-- ─── Extend admin nav counts with open-error-issues count ───────────────────
-- Drops + recreates because the return signature changes.

DROP FUNCTION IF EXISTS public.get_admin_nav_counts();

CREATE OR REPLACE FUNCTION public.get_admin_nav_counts()
RETURNS TABLE (
  disputes_count          INT,
  reports_count           INT,
  stuck_paid              INT,
  stuck_shipped           INT,
  old_disputes            INT,
  account_deletion_count  INT,
  feedback_count          INT,
  open_errors_count       INT
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
    (SELECT COUNT(*)::INT FROM public.feedback WHERE status = 'open')                                                AS feedback_count,
    (SELECT COUNT(*)::INT FROM public.app_error_issues WHERE status = 'open')                                        AS open_errors_count;
$$;

REVOKE ALL ON FUNCTION public.get_admin_nav_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_nav_counts() TO service_role;
