-- Creates the app_errors table for client-side crash and error reporting.
-- Written to by lib/errorReporting.ts (production builds only).

CREATE TABLE public.app_errors (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT        NOT NULL,
  stack_trace   TEXT,
  platform      TEXT,
  os_version    TEXT,
  app_version   TEXT,
  is_fatal      BOOLEAN     DEFAULT FALSE,
  user_id       UUID        REFERENCES public.users (id) ON DELETE SET NULL
);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report errors"
  ON public.app_errors FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_app_errors_created_at ON public.app_errors (created_at DESC);
CREATE INDEX idx_app_errors_user_id    ON public.app_errors (user_id);
