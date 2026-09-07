-- Least privilege on public.users, and move the tax-hold lifecycle
-- server-side.
--
-- The UPDATE policy pinned eight columns via WITH CHECK, but `authenticated`
-- held UPDATE on 33. Everything in that gap was freely self-writable — a
-- deny-list, which fails OPEN for every column added afterwards. Proven with
-- a rolled-back probe: a member could set their own boosts_used to 0 for
-- unlimited free boosts, clear had_founder_subscription to retake founder
-- pricing, and set avg_response_time_mins to award themselves the Fast
-- Responder badge.
--
-- Inverted to an allow-list. New columns are now non-writable by default.

-- ── 1. Tax hold is applied by the database ───────────────────────────
--
-- hooks/useTaxStatus.ts wrote tax_hold from the client when a seller crossed
-- the HMRC reporting threshold. tax_hold is a pinned column, so that write
-- has ALWAYS been silently refused — the automatic hold has never once
-- applied. Compliance shouldn't depend on a client rendering a screen
-- anyway.
CREATE OR REPLACE FUNCTION public.apply_tax_hold_on_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INT;
  v_sales NUMERIC;
BEGIN
  IF NEW.status <> 'completed' OR NEW.seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(item_price), 0)
    INTO v_count, v_sales
  FROM public.orders
  WHERE seller_id = NEW.seller_id
    AND status = 'completed'
    AND created_at >= DATE_TRUNC('year', NOW());

  -- HMRC digital-platform reporting thresholds: 30 sales or ~£1,700/yr.
  -- Matches the numbers useTaxStatus shows the seller.
  IF (v_count >= 29 OR v_sales >= 1690)
     AND NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE id = NEW.seller_id AND tax_id_collected_at IS NOT NULL
     )
  THEN
    UPDATE public.users
       SET tax_hold = TRUE
     WHERE id = NEW.seller_id
       AND tax_hold IS DISTINCT FROM TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_tax_hold ON public.orders;
CREATE TRIGGER trg_apply_tax_hold
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_tax_hold_on_threshold();

-- ── 2. Declaring tax details is an RPC, not a column write ───────────
--
-- tax_id_collected_at is what lifts a tax hold. Leaving it client-writable
-- would let a seller stamp it without ever supplying an identifier and
-- release their own held funds.
CREATE OR REPLACE FUNCTION public.record_tax_declaration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only stamp once the identifier actually exists.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_tax_info
    WHERE user_id = v_uid
      AND COALESCE(TRIM(tax_id_number), '') <> ''
      AND COALESCE(TRIM(tax_id_type),   '') <> ''
  ) THEN
    RAISE EXCEPTION 'No tax identifier on file';
  END IF;

  UPDATE public.users
     SET tax_id_collected_at = COALESCE(tax_id_collected_at, NOW()),
         tax_declaration_at  = NOW(),
         -- Compliance met, so any automatic hold is released.
         tax_hold            = FALSE
   WHERE id = v_uid;
END;
$$;

REVOKE ALL   ON FUNCTION public.record_tax_declaration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_tax_declaration() TO authenticated;

-- ── 3. The allow-list ────────────────────────────────────────────────
--
-- Everything absent from this list is now writable only by a SECURITY
-- DEFINER function or the service role. SECURITY DEFINER runs as the owner,
-- so existing RPCs (activate_seller, admin_update_user_flags,
-- anonymize_user_account, the boost counters, the founder slot helpers) are
-- unaffected.
REVOKE UPDATE ON public.users FROM authenticated, anon;

GRANT UPDATE (
  avatar_url,             -- edit-profile
  bio,                    -- edit-profile
  username,               -- username-picker
  username_confirmed,     -- username-picker
  preferred_categories,   -- onboarding, settings reset
  onboarding_completed,   -- onboarding, settings reset
  marketing_push_consent, -- privacy settings, signup, consent sheet
  marketing_prompted_at,  -- consent sheet
  last_active_at          -- useAuth, on app open
) ON public.users TO authenticated;
