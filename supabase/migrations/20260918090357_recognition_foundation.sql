-- Recognition foundation — 2026-09-18.
--
-- The parts of the Dukanoh Fit rebuild that no engine swap ever touches:
--
--   1. garment_labels      — every labelled photo, from listings (automatic),
--                            Fit confirmations, or a licensed seed set.
--   2. listing feed        — trigger keeps garment_labels in step with listings.
--   3. recognition_events  — one row per engine call, for the scoreboard.
--   4. engine switch       — platform_settings.recognition_engine.
--   5. recognition_accuracy — view: accuracy per engine, per source, per week.
--   6. account deletion    — anonymise clears a seller's listing rows.
--
-- Privacy design: Fit rows carry NO member id and NO reference to the
-- prediction log (the engine's guess is copied in as plain values), so a
-- stored Fit photo can never be traced to an account. Photos with a person
-- in frame are never stored (enforced in store-training-image). Listing rows
-- are linked to the listing and seller because listings are public and
-- already carry that link; they leave when the listing or seller does.

-- ── 1. Dataset ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.garment_labels (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source                   TEXT        NOT NULL CHECK (source IN ('listing', 'fit', 'seed')),
  listing_id               UUID        REFERENCES public.listings(id) ON DELETE CASCADE,
  seller_id                UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  image_url                TEXT        NOT NULL,
  category                 TEXT        NOT NULL CHECK (category IN (
                             'Lehenga', 'Saree', 'Anarkali', 'Salwar Kameez', 'Kurta', 'Sharara', 'Gown',
                             'Dupatta', 'Blouse', 'Salwar',
                             'Sherwani', 'Kurta Pajama', 'Achkan', 'Pathani Suit', 'Nehru Jacket',
                             'Jewellery', 'Accessories', 'Casualwear', 'Shoes')),
  gender                   TEXT        CHECK (gender IS NULL OR gender IN ('Men', 'Women')),
  colour                   TEXT        CHECK (colour IS NULL OR colour IN (
                             'Black', 'White', 'Cream', 'Grey', 'Silver',
                             'Red', 'Maroon', 'Pink', 'Peach', 'Orange', 'Yellow', 'Gold',
                             'Green', 'Teal', 'Blue', 'Navy', 'Purple', 'Multi', 'Other')),
  fabric                   TEXT,
  occasion                 TEXT,
  fabric_weight            TEXT        CHECK (fabric_weight IS NULL OR fabric_weight IN ('Light', 'Structured', 'Heavy')),
  taxonomy_version         INT         NOT NULL DEFAULT 2,
  predicted_category       TEXT,
  predicted_colour         TEXT,
  predicted_confidence     NUMERIC(4,3) CHECK (predicted_confidence IS NULL OR (predicted_confidence >= 0 AND predicted_confidence <= 1)),
  predicted_engine         TEXT,
  predicted_engine_version TEXT,
  corrected                BOOLEAN     GENERATED ALWAYS AS (predicted_category IS NOT NULL AND predicted_category IS DISTINCT FROM category) STORED,
  has_person               BOOLEAN,
  licence                  TEXT,
  licence_source_url       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT garment_labels_listing_rows_linked CHECK (source <> 'listing' OR (listing_id IS NOT NULL AND seller_id IS NOT NULL)),
  CONSTRAINT garment_labels_fit_rows_unlinked  CHECK (source <> 'fit' OR (listing_id IS NULL AND seller_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS garment_labels_listing_image
  ON public.garment_labels (listing_id, image_url) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_garment_labels_source_category ON public.garment_labels (source, category);
CREATE INDEX IF NOT EXISTS idx_garment_labels_seller ON public.garment_labels (seller_id);

ALTER TABLE public.garment_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.garment_labels FROM anon, authenticated;

COMMENT ON TABLE public.garment_labels IS
  'Every labelled garment photo: listing photos (trigger), Dukanoh Fit confirmations (store-training-image, unlinked), seed images. Training set + engine scoreboard.';

-- ── 2. Listing feed ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_garment_labels_for_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.garment_labels WHERE listing_id = NEW.id;
  IF NEW.status IN ('available', 'sold') THEN
    INSERT INTO public.garment_labels
      (source, listing_id, seller_id, image_url, category, gender, colour, fabric, occasion, taxonomy_version)
    SELECT 'listing', NEW.id, NEW.seller_id, img, NEW.category, NEW.gender, NEW.colour, NEW.fabric, NEW.occasion, 2
    FROM unnest(COALESCE(NEW.images, '{}'::text[])) AS img
    WHERE img IS NOT NULL AND img <> ''
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_garment_labels_for_listing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_garment_labels_for_listing() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sync_garment_labels ON public.listings;
CREATE TRIGGER trg_sync_garment_labels
  AFTER INSERT OR UPDATE OF images, category, gender, colour, fabric, occasion, status
  ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_garment_labels_for_listing();

-- Backfill from what's already listed.
INSERT INTO public.garment_labels
  (source, listing_id, seller_id, image_url, category, gender, colour, fabric, occasion, taxonomy_version)
SELECT 'listing', l.id, l.seller_id, img, l.category, l.gender, l.colour, l.fabric, l.occasion, 2
FROM public.listings l
CROSS JOIN LATERAL unnest(COALESCE(l.images, '{}'::text[])) AS img
WHERE l.status IN ('available', 'sold') AND img IS NOT NULL AND img <> ''
ON CONFLICT DO NOTHING;

-- ── 3. Prediction log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recognition_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  source           TEXT        NOT NULL CHECK (source IN ('fit', 'sell')),
  requested_engine TEXT,
  engine           TEXT        NOT NULL,
  engine_version   TEXT,
  outcome          TEXT        NOT NULL CHECK (outcome IN ('ok', 'unavailable')),
  is_clothing      BOOLEAN,
  category         TEXT,
  colour           TEXT,
  confidence       NUMERIC(4,3),
  has_person       BOOLEAN,
  latency_ms       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recognition_events_created ON public.recognition_events (created_at);
CREATE INDEX IF NOT EXISTS idx_recognition_events_engine  ON public.recognition_events (engine, engine_version);

ALTER TABLE public.recognition_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recognition_events FROM anon, authenticated;

COMMENT ON TABLE public.recognition_events IS
  'One row per recognition call (no image, no link to any stored photo). Written by validate-clothing with the service role.';

-- ── 4. Engine switch ─────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value)
VALUES ('recognition_engine', 'rekognition')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Scoreboard ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.recognition_accuracy AS
SELECT
  date_trunc('week', created_at)::date                                                     AS week,
  predicted_engine                                                                          AS engine,
  predicted_engine_version                                                                  AS engine_version,
  source,
  count(*)::int                                                                             AS predictions,
  count(*) FILTER (WHERE predicted_category = category)::int                                AS category_correct,
  count(*) FILTER (WHERE predicted_colour IS NOT NULL AND colour IS NOT NULL)::int          AS colour_compared,
  count(*) FILTER (WHERE predicted_colour IS NOT NULL AND predicted_colour = colour)::int   AS colour_correct
FROM public.garment_labels
WHERE predicted_category IS NOT NULL
GROUP BY 1, 2, 3, 4;

REVOKE ALL ON public.recognition_accuracy FROM anon, authenticated;

-- ── 6. Account deletion ──────────────────────────────────────────────────────
-- Same bodies as live, plus the two training-data lines after notifications.

CREATE OR REPLACE FUNCTION public.anonymize_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id           UUID := auth.uid();
  v_user              public.users%ROWTYPE;
  v_wallet            public.seller_wallet%ROWTYPE;
  v_active_order_id   UUID;
  v_archived_listings INT;
  v_new_username      TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED:no_user';
  END IF;

  IF v_user.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_deleted', TRUE);
  END IF;

  IF v_user.is_official THEN
    RAISE EXCEPTION 'BLOCKED:official_account';
  END IF;

  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    RAISE EXCEPTION 'BLOCKED:active_pro_subscription';
  END IF;

  UPDATE public.listings
     SET status = 'archived'
   WHERE seller_id = v_user_id
     AND status   = 'available';
  GET DIAGNOSTICS v_archived_listings = ROW_COUNT;

  SELECT id INTO v_active_order_id
  FROM public.orders
  WHERE (buyer_id = v_user_id OR seller_id = v_user_id)
    AND status IN ('created','paid','shipped','delivered','disputed')
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCKED:active_orders';
  END IF;

  SELECT * INTO v_wallet FROM public.seller_wallet
    WHERE seller_id = v_user_id FOR UPDATE;
  IF FOUND AND (v_wallet.pending_balance > 0 OR v_wallet.available_balance > 0) THEN
    RAISE EXCEPTION 'BLOCKED:wallet_balance';
  END IF;

  v_new_username := 'deleted_user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  UPDATE public.users
     SET username                  = v_new_username,
         username_confirmed        = TRUE,
         avatar_url                = NULL,
         bio                       = NULL,
         preferred_categories      = '{}',
         marketing_consent         = FALSE,
         marketing_push_consent    = FALSE,
         analytics_consent         = FALSE,
         sale_mode_active          = FALSE,
         sale_mode_discount_pct    = NULL,
         account_status            = 'deleted',
         deleted_at                = NOW()
   WHERE id = v_user_id;

  DELETE FROM public.user_private WHERE user_id = v_user_id;

  DELETE FROM public.push_tokens   WHERE user_id    = v_user_id;
  DELETE FROM public.saved_items   WHERE user_id    = v_user_id;
  DELETE FROM public.collections   WHERE seller_id  = v_user_id;
  DELETE FROM public.blocked_users WHERE blocker_id = v_user_id OR blocked_id = v_user_id;
  DELETE FROM public.notifications WHERE user_id    = v_user_id;

  -- Training data: listing photos leave with the seller. Fit photos carry no
  -- link, so there is nothing to find. The prediction log keeps its rows but
  -- forgets the member.
  DELETE FROM public.garment_labels WHERE seller_id = v_user_id;
  UPDATE public.recognition_events SET user_id = NULL WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'already_deleted',   FALSE,
    'archived_listings', v_archived_listings,
    'new_username',      v_new_username
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_anonymize_user_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user              public.users%ROWTYPE;
  v_wallet            public.seller_wallet%ROWTYPE;
  v_active_order_id   UUID;
  v_archived_listings INT;
  v_new_username      TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED:no_user';
  END IF;

  IF v_user.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_deleted', TRUE);
  END IF;

  IF v_user.is_official THEN
    RAISE EXCEPTION 'BLOCKED:official_account';
  END IF;

  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    RAISE EXCEPTION 'BLOCKED:active_pro_subscription';
  END IF;

  UPDATE public.listings
     SET status = 'archived'
   WHERE seller_id = p_user_id
     AND status   = 'available';
  GET DIAGNOSTICS v_archived_listings = ROW_COUNT;

  SELECT id INTO v_active_order_id
  FROM public.orders
  WHERE (buyer_id = p_user_id OR seller_id = p_user_id)
    AND status IN ('created','paid','shipped','delivered','disputed')
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCKED:active_orders';
  END IF;

  SELECT * INTO v_wallet FROM public.seller_wallet
    WHERE seller_id = p_user_id FOR UPDATE;
  IF FOUND AND (v_wallet.pending_balance > 0 OR v_wallet.available_balance > 0) THEN
    RAISE EXCEPTION 'BLOCKED:wallet_balance';
  END IF;

  v_new_username := 'deleted_user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  UPDATE public.users
     SET username                  = v_new_username,
         username_confirmed        = TRUE,
         avatar_url                = NULL,
         bio                       = NULL,
         preferred_categories      = '{}',
         marketing_consent         = FALSE,
         marketing_push_consent    = FALSE,
         analytics_consent         = FALSE,
         sale_mode_active          = FALSE,
         sale_mode_discount_pct    = NULL,
         account_status            = 'deleted',
         deleted_at                = NOW()
   WHERE id = p_user_id;

  DELETE FROM public.user_private WHERE user_id = p_user_id;

  DELETE FROM public.push_tokens   WHERE user_id    = p_user_id;
  DELETE FROM public.saved_items   WHERE user_id    = p_user_id;
  DELETE FROM public.collections   WHERE seller_id  = p_user_id;
  DELETE FROM public.blocked_users WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id    = p_user_id;

  -- Training data — see anonymize_user_account().
  DELETE FROM public.garment_labels WHERE seller_id = p_user_id;
  UPDATE public.recognition_events SET user_id = NULL WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'already_deleted',   FALSE,
    'archived_listings', v_archived_listings,
    'new_username',      v_new_username
  );
END;
$function$;

-- ── 7. Superseded ────────────────────────────────────────────────────────────
COMMENT ON TABLE public.fit_training_images IS
  'Superseded by garment_labels (2026-09-18). No longer written; dropped when Fit photos move from S3 to Supabase Storage.';
