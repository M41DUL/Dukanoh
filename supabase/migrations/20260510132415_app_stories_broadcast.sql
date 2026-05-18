-- ============================================================
-- App stories: admin-authored broadcast cards shown under the
-- Dukanoh-branded story bubble at the top of the home feed.
-- Replaces the 4 hardcoded weekly messages in useStories.ts (those
-- still live as a fallback when the table is empty).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_stories (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  image_url       TEXT NOT NULL,
  headline        TEXT,
  body            TEXT,
  cta_label       TEXT,
  cta_destination TEXT,
  cta_listing_id  UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT app_stories_cta_consistent CHECK (
    (cta_label IS NULL AND cta_destination IS NULL AND cta_listing_id IS NULL)
    OR (
      cta_label IS NOT NULL
      AND cta_destination IN ('home','search','sell','saved','dukanoh-fit','boosts','specific-listing')
      AND (
        cta_destination <> 'specific-listing'
        OR cta_listing_id IS NOT NULL
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS app_stories_published_at_idx
  ON public.app_stories (published_at DESC);

ALTER TABLE public.app_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active app stories visible; admins see all"
  ON public.app_stories FOR SELECT TO authenticated
  USING (
    expires_at IS NULL OR expires_at > now()
    OR EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE key = 'admin_user_ids'
        AND value::jsonb @> to_jsonb((select auth.uid())::text)
    )
  );

CREATE OR REPLACE FUNCTION public.admin_save_app_story(
  p_id              uuid,
  p_image_url       text,
  p_headline        text,
  p_body            text,
  p_cta_label       text,
  p_cta_destination text,
  p_cta_listing_id  uuid,
  p_expires_at      timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
  saved_id        uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  IF p_image_url IS NULL OR p_image_url = '' THEN
    RAISE EXCEPTION 'image_url is required';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.app_stories (
      image_url, headline, body, cta_label, cta_destination, cta_listing_id, expires_at, created_by
    )
    VALUES (
      p_image_url, p_headline, p_body, p_cta_label, p_cta_destination, p_cta_listing_id, p_expires_at, auth.uid()
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.app_stories SET
      image_url       = p_image_url,
      headline        = p_headline,
      body            = p_body,
      cta_label       = p_cta_label,
      cta_destination = p_cta_destination,
      cta_listing_id  = p_cta_listing_id,
      expires_at      = p_expires_at,
      updated_at      = now()
    WHERE id = p_id
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'story not found';
    END IF;
  END IF;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_app_story(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  DELETE FROM public.app_stories WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_app_story(uuid, text, text, text, text, text, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_app_story(uuid, text, text, text, text, text, uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_app_story(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_app_story(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-stories', 'app-stories', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "App story images publicly readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'app-stories');

CREATE POLICY "Admins can upload app story images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-stories'
    AND EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE key = 'admin_user_ids'
        AND value::jsonb @> to_jsonb((select auth.uid())::text)
    )
  );

CREATE POLICY "Admins can delete app story images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'app-stories'
    AND EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE key = 'admin_user_ids'
        AND value::jsonb @> to_jsonb((select auth.uid())::text)
    )
  );
