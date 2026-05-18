-- Make image_url nullable so the 4 seeded "default" stories (which have
-- copy but no admin-uploaded image) can live in the table. The viewer
-- already falls back to a default hero banner when imageUrl is missing.
ALTER TABLE public.app_stories ALTER COLUMN image_url DROP NOT NULL;

-- Add 'listings' to the allowed cta_destination values so the seeded
-- stories preserve their original "Browse listings" CTA exactly.
ALTER TABLE public.app_stories DROP CONSTRAINT app_stories_cta_consistent;
ALTER TABLE public.app_stories ADD CONSTRAINT app_stories_cta_consistent CHECK (
  (cta_label IS NULL AND cta_destination IS NULL AND cta_listing_id IS NULL)
  OR (
    cta_label IS NOT NULL
    AND cta_destination IN ('home','search','sell','saved','dukanoh-fit','boosts','specific-listing','listings')
    AND (
      cta_destination <> 'specific-listing'
      OR cta_listing_id IS NOT NULL
    )
  )
);

-- Relax the RPC's "image_url required" check. A valid story must now
-- have either an image OR some text content (image / headline / body / cta).
CREATE OR REPLACE FUNCTION public.admin_save_app_story(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
  saved_id        uuid;
  v_id            uuid;
  v_image_url     text;
  v_headline      text;
  v_body          text;
  v_cta_label     text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  v_image_url := NULLIF(payload->>'image_url', '');
  v_headline  := NULLIF(payload->>'headline',  '');
  v_body      := NULLIF(payload->>'body',      '');
  v_cta_label := NULLIF(payload->>'cta_label', '');

  IF v_image_url IS NULL AND v_headline IS NULL AND v_body IS NULL AND v_cta_label IS NULL THEN
    RAISE EXCEPTION 'story must have an image or some text content';
  END IF;

  v_id := NULLIF(payload->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.app_stories (
      image_url, headline, body, cta_label, cta_destination, cta_listing_id, expires_at, created_by
    )
    VALUES (
      v_image_url,
      v_headline,
      v_body,
      v_cta_label,
      payload->>'cta_destination',
      NULLIF(payload->>'cta_listing_id', '')::uuid,
      NULLIF(payload->>'expires_at', '')::timestamptz,
      auth.uid()
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.app_stories SET
      image_url       = v_image_url,
      headline        = v_headline,
      body            = v_body,
      cta_label       = v_cta_label,
      cta_destination = payload->>'cta_destination',
      cta_listing_id  = NULLIF(payload->>'cta_listing_id', '')::uuid,
      expires_at      = NULLIF(payload->>'expires_at', '')::timestamptz,
      updated_at      = now()
    WHERE id = v_id
    RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'story not found';
    END IF;
  END IF;

  RETURN saved_id;
END;
$$;

-- Seed the 4 originally-hardcoded stories. created_by is left NULL to
-- mark them as system-seeded (vs admin-authored). Ordered so #1 has the
-- newest published_at and shows first in the gradient card / viewer.
INSERT INTO public.app_stories (image_url, headline, body, cta_label, cta_destination, expires_at, published_at)
VALUES
  (NULL,
   'Welcome to Dukanoh',
   'The South Asian fashion marketplace. Buy and sell pre-loved clothing from your community.',
   'Start browsing', 'listings', NULL,
   now() + interval '4 seconds'),
  (NULL,
   'How it works',
   'Browse listings, message sellers directly, and arrange collection or delivery between you.',
   'Explore now', 'listings', NULL,
   now() + interval '3 seconds'),
  (NULL,
   'Discover your style',
   'Lehengas, sherwanis, sarees and more — all pre-loved, all at a fraction of the price.',
   'Browse listings', 'listings', NULL,
   now() + interval '2 seconds'),
  (NULL,
   'Join the community',
   'Save your favourites, follow price drops, and find outfits for every occasion.',
   'Get started', 'listings', NULL,
   now() + interval '1 seconds');
