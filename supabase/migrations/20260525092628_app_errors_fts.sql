-- Full-text search over crash report events.
--
-- The /admin/errors list page exposes a search box for finding issues by
-- words in the error message or anywhere in the stack trace. We index the
-- raw events (app_errors) rather than the aggregate (app_error_issues)
-- because only events carry the stack trace.
--
-- The list page resolves a search query to a set of matching fingerprints
-- via this index, then filters app_error_issues to those fingerprints —
-- still cheap because the GIN index keeps the trace-search lookup fast.

ALTER TABLE public.app_errors
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'simple',
        coalesce(error_message, '') || ' ' || coalesce(stack_trace, '')
      )
    ) STORED;

-- Simple dictionary, no stopwords — stack traces contain many tokens that
-- 'english' would strip (e.g. "at", "in"), and code identifiers are
-- meaningful as-is without stemming.
CREATE INDEX IF NOT EXISTS idx_app_errors_search_tsv
  ON public.app_errors
  USING GIN (search_tsv);
