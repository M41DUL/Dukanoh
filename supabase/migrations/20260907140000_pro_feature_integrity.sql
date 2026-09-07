-- Make two advertised Pro features behave, and gate the third server-side.

-- ── 1. Profile views: one per viewer per day ─────────────────────────
--
-- profile_views has been READ by the Pro dashboard since the feature
-- shipped, but nothing ever wrote to it — the table was empty and every Pro
-- subscriber saw "0 profile views" forever. The client now inserts on visit;
-- this index keeps a refresh-happy viewer from inflating the count.
--
-- AT TIME ZONE 'UTC' because timestamptz::date is only STABLE, and a unique
-- index expression must be IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_views_daily_unique
  ON public.profile_views (
    profile_user_id,
    viewer_user_id,
    ((viewed_at AT TIME ZONE 'UTC')::date)
  );

-- ── 2. Price Drop badge is a paid feature ────────────────────────────
--
-- The badge columns were only ever written by the Pro bulk-edit sheet, so
-- the entitlement was enforced by nothing more than which screen you could
-- reach. Any member can call PostgREST directly and set them.
--
-- Also expiry-aware: a lapsed subscriber stops earning new badges the moment
-- pro_expires_at passes, without waiting for the nightly downgrade sweep.
CREATE OR REPLACE FUNCTION public.enforce_price_drop_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.price_dropped_at IS NULL AND NEW.original_price IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = NEW.seller_id
      AND seller_tier IN ('pro', 'founder')
      AND (pro_expires_at IS NULL OR pro_expires_at > NOW())
  ) THEN
    -- Silently strip rather than raise: the price change itself is
    -- legitimate, only the badge isn't.
    NEW.price_dropped_at := NULL;
    NEW.original_price   := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_price_drop_tier ON public.listings;
CREATE TRIGGER trg_enforce_price_drop_tier
  BEFORE INSERT OR UPDATE OF price, original_price, price_dropped_at
  ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_price_drop_tier();

-- ── 3. Downgrading clears the badges it paid for ─────────────────────
--
-- price_dropped_at is stored, not derived, so without this a lapsed Pro
-- seller kept the badge on every listing indefinitely.
CREATE OR REPLACE FUNCTION public.expire_pro_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, seller_tier
    FROM public.users
    WHERE seller_tier IN ('pro', 'founder')
      AND pro_expires_at IS NOT NULL
      AND pro_expires_at < NOW()
  LOOP
    IF r.seller_tier = 'founder' THEN
      PERFORM public.release_founder_slot(r.id);
    END IF;

    UPDATE public.users SET seller_tier = 'free' WHERE id = r.id;

    UPDATE public.listings
       SET original_price = NULL, price_dropped_at = NULL
     WHERE seller_id = r.id
       AND (price_dropped_at IS NOT NULL OR original_price IS NOT NULL);
  END LOOP;
END;
$$;
