-- Crash reporting has never recorded a single row. Not because there were no
-- errors — because every insert into app_errors threw.
--
-- app_errors has a BEFORE INSERT trigger that fills `fingerprint` via
-- compute_error_fingerprint(), which calls digest() from pgcrypto. On
-- 2026-06-07, migration 20260607112508_harden_security_definer_rpcs added
-- `SET search_path = public` to the SECURITY DEFINER functions — correct in
-- itself, but pgcrypto is installed in the `extensions` schema, so digest()
-- stopped resolving:
--
--   ERROR: function digest(text, unknown) does not exist
--
-- The trigger raised, the insert failed, and lib/errorReporting.ts swallows
-- everything by design ("never crash the crash reporter"). So the app has
-- been silently unable to report ANY error for three months, and the empty
-- table read as "no crashes" rather than "reporting is broken".
--
-- Fixed by schema-qualifying the call rather than widening search_path, so
-- the hardening stays intact and this can't regress if the extension schema
-- changes again.
CREATE OR REPLACE FUNCTION public.compute_error_fingerprint(
  msg   TEXT,
  stack TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
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

  norm_frames := regexp_replace(norm_frames, ':\d+:\d+',     '', 'g');
  norm_frames := regexp_replace(norm_frames, ':\d+',         '', 'g');
  norm_frames := regexp_replace(norm_frames, '0x[0-9a-f]+',  '', 'gi');
  norm_frames := lower(norm_frames);

  -- Schema-qualified: pgcrypto lives in `extensions`, and this function's
  -- search_path is deliberately pinned to `public`.
  RETURN encode(extensions.digest(norm_msg || '|' || norm_frames, 'sha256'), 'hex');
END;
$$;
