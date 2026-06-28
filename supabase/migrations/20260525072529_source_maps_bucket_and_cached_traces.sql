-- Source-map storage + cached symbolicated traces for crash-report issues.
--
-- Phase 1 step 4: source maps are uploaded manually via /admin/source-maps
-- after every EAS build. The symbolicate API at /api/admin/symbolicate
-- downloads the map for a given (app_version, platform) and translates
-- minified stack frames to original-source positions.
--
-- We cache the latest symbolicated trace per issue so repeated views are
-- instant. The cached version is keyed by app_version so we can detect
-- when a new event lands under a different release and invalidate.

-- Storage bucket — private. Default RLS on storage.objects denies
-- everything; service role (the admin API routes) bypasses RLS, which is
-- exactly what we want — no client can ever read these.
INSERT INTO storage.buckets (id, name, public)
VALUES ('source-maps', 'source-maps', false)
ON CONFLICT (id) DO NOTHING;

-- Cached symbolicated trace per issue. trace = the rendered text, version
-- = the app_version that the cache corresponds to. When a new event lands
-- with a different app_version, the symbolicate endpoint invalidates this.
ALTER TABLE public.app_error_issues
  ADD COLUMN IF NOT EXISTS latest_symbolicated_trace   TEXT,
  ADD COLUMN IF NOT EXISTS latest_symbolicated_version TEXT;
