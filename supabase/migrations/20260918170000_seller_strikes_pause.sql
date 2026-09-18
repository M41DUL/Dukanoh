-- Seller cancellation strikes: 12-month expiry, a real pause at five, admin lift.
--
-- BEFORE: handle_cancellation_strike() bumped users.cancellation_strike_count for
-- ever and flipped account_status to 'warned' at 3 and 'suspended' at 5. Nothing
-- read 'suspended' except a banner in the Pro dashboard, so a suspended seller
-- could still list, sell and be paid, and non-Pro sellers were never told.
--
-- AFTER (Terms clause 4.7, Privacy §20):
--   • A strike counts for 12 months from the day it was given, then expires.
--   • 3 active strikes → 'warned' (push). 5 → 'suspended' = selling paused
--     (push + email): listings hidden, checkout refused, no new listings.
--   • users.selling_paused is a public-safe generated flag the app and website
--     filter on, so nobody has to read account_status cross-user.
--   • Admins lift a pause via admin_set_seller_standing('restore'), which
--     forgives the active strikes; 'pause' applies a manual pause that the
--     strike maths cannot undo (admin_suspended_at).
--   • A nightly job recomputes every seller with strikes so expiries take effect.
--
-- Notifications reuse the reminder path: pg_net → push-notification / send-email
-- with x-dukanoh-key = INTERNAL_API_KEY (Vault: supabase_url, INTERNAL_API_KEY).

-- ── Strikes: reason + forgiveness ─────────────────────────────────────────
ALTER TABLE public.cancellation_strikes
  ADD COLUMN IF NOT EXISTS reason      TEXT DEFAULT 'seller_cancelled' CHECK (reason IN ('seller_cancelled', 'dispatch_deadline')),
  ADD COLUMN IF NOT EXISTS forgiven_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cancellation_strikes.reason IS
  'Why the strike was given. cancel_order() inserts without a reason (default seller_cancelled); the auto-cancel job writes dispatch_deadline.';

COMMENT ON COLUMN public.cancellation_strikes.forgiven_at IS
  'Set when an admin restores the seller; forgiven strikes never count again.';

CREATE INDEX IF NOT EXISTS idx_strikes_seller_active
  ON public.cancellation_strikes (seller_id, created_at)
  WHERE forgiven_at IS NULL;

-- ── Users: admin override + public-safe pause flag ────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_suspended_at TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS selling_paused BOOLEAN
  GENERATED ALWAYS AS (account_status = 'suspended') STORED;

COMMENT ON COLUMN public.users.selling_paused IS
  'TRUE while account_status = suspended. Safe to read cross-user; the app hides these sellers'' listings and refuses checkout.';

-- anon (website listing page) may read the flag; account_status stays private.
GRANT SELECT (selling_paused) ON public.users TO anon;

-- ── Recompute one seller's standing ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_seller_standing(p_seller_id UUID)
RETURNS void AS $$
DECLARE
  v_active INT;
  v_old    TEXT;
  v_new    TEXT;
  v_admin  TIMESTAMPTZ;
  v_url    TEXT;
  v_key    TEXT;
BEGIN
  SELECT account_status, admin_suspended_at
    INTO v_old, v_admin
    FROM public.users WHERE id = p_seller_id;
  IF v_old IS NULL OR v_old = 'deleted' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_active
    FROM public.cancellation_strikes
   WHERE seller_id = p_seller_id
     AND forgiven_at IS NULL
     AND created_at >= NOW() - INTERVAL '12 months';

  v_new := CASE
    WHEN v_admin IS NOT NULL OR v_active >= 5 THEN 'suspended'
    WHEN v_active >= 3                        THEN 'warned'
    ELSE 'active'
  END;

  UPDATE public.users
     SET cancellation_strike_count = v_active,
         account_status            = v_new
   WHERE id = p_seller_id
     AND (cancellation_strike_count IS DISTINCT FROM v_active
          OR account_status IS DISTINCT FROM v_new);

  -- Tell the seller only when standing gets worse. Restores are explained by
  -- the admin who granted them; expiries are silent.
  IF v_new = v_old
     OR v_new NOT IN ('warned', 'suspended')
     OR (v_new = 'warned' AND v_old = 'suspended') THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_API_KEY';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'recompute_seller_standing: vault secrets missing; seller % not notified', p_seller_id;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dukanoh-key', v_key),
    body := jsonb_build_object(
      'type', CASE WHEN v_new = 'suspended' THEN 'SELLING_PAUSED' ELSE 'STRIKE_WARNING' END,
      'table', 'users',
      'record', jsonb_build_object('id', p_seller_id, 'account_status', v_new, 'strike_count', v_active)
    )
  );

  IF v_new = 'suspended' THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dukanoh-key', v_key),
      body := jsonb_build_object(
        'type', 'SELLING_PAUSED',
        'table', 'users',
        'record', jsonb_build_object('id', p_seller_id, 'strike_count', v_active)
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.recompute_seller_standing(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_seller_standing(UUID) TO postgres, service_role;

-- ── Trigger: every new strike recomputes the seller ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_cancellation_strike()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.recompute_seller_standing(NEW.seller_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- on_cancellation_strike (AFTER INSERT) already points at this function.

-- ── Admin: restore (forgive) or pause ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_seller_standing(p_seller_id UUID, p_action TEXT)
RETURNS void AS $$
BEGIN
  IF p_action = 'restore' THEN
    UPDATE public.cancellation_strikes
       SET forgiven_at = NOW()
     WHERE seller_id = p_seller_id AND forgiven_at IS NULL;
    UPDATE public.users SET admin_suspended_at = NULL WHERE id = p_seller_id;
  ELSIF p_action = 'pause' THEN
    UPDATE public.users SET admin_suspended_at = NOW() WHERE id = p_seller_id;
  ELSE
    RAISE EXCEPTION 'admin_set_seller_standing: unknown action %', p_action;
  END IF;
  PERFORM public.recompute_seller_standing(p_seller_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.admin_set_seller_standing(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_seller_standing(UUID, TEXT) TO service_role;

-- ── Paused sellers cannot create listings ─────────────────────────────────
DROP POLICY IF EXISTS "Sellers can create listings" ON public.listings;
CREATE POLICY "Sellers can create listings"
  ON public.listings FOR INSERT WITH CHECK (
    (select auth.uid()) = seller_id
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = (select auth.uid()) AND u.account_status = 'suspended'
    )
  );

-- ── Nightly: apply strike expiries ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_all_seller_standing()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT seller_id AS id FROM public.cancellation_strikes
    UNION
    SELECT id FROM public.users WHERE account_status IN ('warned', 'suspended')
  LOOP
    PERFORM public.recompute_seller_standing(r.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.recompute_all_seller_standing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_seller_standing() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-seller-standing') THEN
    PERFORM cron.unschedule('recompute-seller-standing');
  END IF;
END $$;

SELECT cron.schedule(
  'recompute-seller-standing',
  '30 3 * * *',
  'SELECT public.recompute_all_seller_standing()'
);

-- Bring existing sellers onto the 12-month window.
SELECT public.recompute_all_seller_standing();
