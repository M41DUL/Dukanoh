-- ============================================================
-- BROADCASTS — admin-authored push notifications sent to a cohort.
-- Send-now only (no scheduling in this iteration).
-- Composer at app/admin/broadcasts.tsx; delivery via the new
-- admin-broadcast edge function (uses service role to read push
-- tokens and POSTs to Expo's push API).
-- ============================================================

-- Last-active tracking. Used by the "active in last X days" audience
-- filter. Bumped from the client (useAuth) when a session is observed.
-- Null-default; backfilled-from-nothing so the filter only matches
-- users who open the app going forward.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_last_active_at_idx
  ON public.users (last_active_at DESC);

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  -- Same fixed-list destinations as app stories.
  deep_link_destination TEXT,
  deep_link_listing_id  UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  -- Audience filters. NULL means "no constraint on this dimension".
  audience_role         TEXT CHECK (audience_role IN ('buyers','sellers')),
  audience_tier         TEXT CHECK (audience_tier IN ('free','pro','founder')),
  audience_active_days  INT  CHECK (audience_active_days IS NULL OR audience_active_days > 0),
  -- Delivery lifecycle.
  status          TEXT NOT NULL CHECK (status IN ('sending','sent','failed')),
  recipient_count INT  NOT NULL DEFAULT 0,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  sent_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT broadcasts_deep_link_consistent CHECK (
    deep_link_destination IS NULL
    OR (
      deep_link_destination IN ('home','search','sell','saved','listings','dukanoh-fit','boosts','specific-listing')
      AND (deep_link_destination <> 'specific-listing' OR deep_link_listing_id IS NOT NULL)
    )
  )
);

CREATE INDEX IF NOT EXISTS broadcasts_created_at_idx
  ON public.broadcasts (created_at DESC);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- Admin-only access. The edge function uses the service-role key
-- (bypasses RLS) so writes for the actual delivery still work.
CREATE POLICY "Admins read broadcasts"
  ON public.broadcasts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE key = 'admin_user_ids'
        AND value::jsonb @> to_jsonb((select auth.uid())::text)
    )
  );

-- No client-side INSERT/UPDATE/DELETE — all writes via the edge
-- function with the service-role key.

-- ─── Audience count RPC ────────────────────────────────────────
-- Powers the "X users will receive this" preview in the composer.
-- Admin-gated. The push_tokens join means a user without a token
-- doesn't count (they can't receive a push regardless of consent).
CREATE OR REPLACE FUNCTION public.admin_count_broadcast_audience(filters jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
  v_role          text;
  v_tier          text;
  v_active_days   int;
  v_count         int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  v_role        := NULLIF(filters->>'audience_role', '');
  v_tier        := NULLIF(filters->>'audience_tier', '');
  v_active_days := NULLIF(filters->>'audience_active_days', '')::int;

  SELECT COUNT(DISTINCT u.id) INTO v_count
  FROM public.users u
  JOIN public.push_tokens pt ON pt.user_id = u.id
  WHERE u.marketing_push_consent = true
    AND (v_role IS NULL
         OR (v_role = 'buyers'  AND u.is_seller = false)
         OR (v_role = 'sellers' AND u.is_seller = true))
    AND (v_tier IS NULL OR u.seller_tier = v_tier)
    AND (v_active_days IS NULL
         OR u.last_active_at >= now() - (v_active_days || ' days')::interval);

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_count_broadcast_audience(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_count_broadcast_audience(jsonb) TO authenticated;
