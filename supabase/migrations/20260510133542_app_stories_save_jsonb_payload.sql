-- Replace the positional-arg admin_save_app_story with a single-jsonb-payload
-- variant. Reason: Supabase's TypeScript type generator emits non-nullable
-- types for positional function args, so passing NULL for the optional
-- columns (headline / body / cta_*) fails type-checking on the client.
-- A single jsonb payload is typed as `Json`, which natively allows nulls
-- in the keys — matching the pattern already used by admin_update_user_flags.

DROP FUNCTION IF EXISTS public.admin_save_app_story(uuid, text, text, text, text, text, uuid, timestamptz);

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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE key = 'admin_user_ids'
      AND value::jsonb @> to_jsonb(auth.uid()::text)
  ) INTO is_caller_admin;

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  v_image_url := payload->>'image_url';
  IF v_image_url IS NULL OR v_image_url = '' THEN
    RAISE EXCEPTION 'image_url is required';
  END IF;

  v_id := NULLIF(payload->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.app_stories (
      image_url, headline, body, cta_label, cta_destination, cta_listing_id, expires_at, created_by
    )
    VALUES (
      v_image_url,
      payload->>'headline',
      payload->>'body',
      payload->>'cta_label',
      payload->>'cta_destination',
      NULLIF(payload->>'cta_listing_id', '')::uuid,
      NULLIF(payload->>'expires_at', '')::timestamptz,
      auth.uid()
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.app_stories SET
      image_url       = v_image_url,
      headline        = payload->>'headline',
      body            = payload->>'body',
      cta_label       = payload->>'cta_label',
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

REVOKE ALL ON FUNCTION public.admin_save_app_story(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_app_story(jsonb) TO authenticated;
