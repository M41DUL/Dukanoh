-- Metadata table for uploaded source maps.
--
-- The map file itself lives in the 'source-maps' storage bucket. This
-- table makes /admin/source-maps cheap to render (one query vs. recursive
-- bucket listing) and gives us a single place to attach the git sha for
-- each release — used in step 7 for source-code linking with the exact
-- shipped commit instead of HEAD.

CREATE TABLE IF NOT EXISTS public.source_maps (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version     TEXT         NOT NULL,
  platform        TEXT         NOT NULL CHECK (platform IN ('ios', 'android')),
  git_sha         TEXT,
  storage_path    TEXT         NOT NULL,
  file_size_bytes BIGINT,
  uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (app_version, platform)
);

ALTER TABLE public.source_maps ENABLE ROW LEVEL SECURITY;
-- Service role only — no anon/auth policies. Admin API routes use the
-- service-role client; nothing else should ever read this.

CREATE INDEX IF NOT EXISTS idx_source_maps_uploaded_at
  ON public.source_maps (uploaded_at DESC);
