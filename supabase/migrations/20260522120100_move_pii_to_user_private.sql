-- Move personal data out of public.users into a private 1:1 table.
--
-- public.users has a SELECT policy of USING (true). The previous migration
-- closed this for the `anon` role with column grants; this migration closes it
-- for the `authenticated` role too, for the columns that are genuine PII, by
-- relocating them into public.user_private with own-row-only RLS.
--
-- public.users keeps only fields that are safe for cross-user (seller-profile)
-- reads. user_private holds real name, contact details, address and Stripe
-- account references -- readable and writable only by their owner.
--
-- Follows the public.user_tax_info pattern (migration 20260519130000).
-- Internal-state columns (subscription, boosts, moderation, consent) are
-- intentionally left on public.users -- they are not PII and are wired into
-- payment/subscription/moderation database functions. They remain protected
-- from anonymous reads by the column grants in the previous migration.

-- ── 1. Private table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_private (
  user_id                     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name                   TEXT NOT NULL DEFAULT 'New User',
  first_name                  TEXT,
  last_name                   TEXT,
  phone                       TEXT,
  dob                         DATE,
  location                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  postcode                    TEXT,
  country                     TEXT DEFAULT 'United Kingdom',
  stripe_account_id           TEXT,
  stripe_onboarding_complete  BOOLEAN NOT NULL DEFAULT FALSE,
  seller_invite_code          TEXT UNIQUE,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own private data"
  ON public.user_private FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own private data"
  ON public.user_private FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own private data"
  ON public.user_private FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Defence in depth: the `anon` role must never touch this table. RLS already
-- denies it (no policy applies to anon), but revoke the grant outright too.
REVOKE ALL ON public.user_private FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_private TO authenticated;

-- ── 2. Backfill from existing user rows ─────────────────────────────────────
INSERT INTO public.user_private (
  user_id, full_name, first_name, last_name, phone, dob, location,
  address_line1, address_line2, city, postcode, country,
  stripe_account_id, stripe_onboarding_complete, seller_invite_code
)
SELECT
  id, full_name, first_name, last_name, phone, dob, location,
  address_line1, address_line2, city, postcode, country,
  stripe_account_id, COALESCE(stripe_onboarding_complete, FALSE), seller_invite_code
FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- ── 3. Update the signup trigger ────────────────────────────────────────────
-- full_name now lives in user_private, so the auto-create trigger writes the
-- public columns to users and the name to user_private.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_confirmed BOOLEAN;
BEGIN
  v_username := NEW.raw_user_meta_data->>'username';
  IF v_username IS NOT NULL THEN
    v_confirmed := TRUE;
  ELSE
    v_username := 'user_' || substring(NEW.id::text, 1, 8);
    v_confirmed := FALSE;
  END IF;

  INSERT INTO public.users (id, username, username_confirmed)
  VALUES (NEW.id, v_username, v_confirmed);

  INSERT INTO public.user_private (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'New User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4. Update the account-anonymization functions ───────────────────────────
-- The moved columns are no longer on public.users. PII anonymization is now a
-- single DELETE of the private row.
CREATE OR REPLACE FUNCTION public.anonymize_user_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Idempotent replay: a previous Edge Function run anonymized this user
    -- but a downstream step (auth ban, Stripe close, storage) failed.
    RETURN jsonb_build_object('already_deleted', TRUE);
  END IF;

  IF v_user.is_official THEN
    RAISE EXCEPTION 'BLOCKED:official_account';
  END IF;

  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    RAISE EXCEPTION 'BLOCKED:active_pro_subscription';
  END IF;

  -- Archive available listings first — closes the inbound-order path so
  -- the guard below cannot race with a new order being placed.
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

  -- Retired username. Original is not freed for reuse — prevents
  -- impersonation of historical reviews and conversations.
  -- gen_random_uuid() rather than uuid_generate_v4() because the latter is in
  -- the `extensions` schema, which is excluded by SET search_path = public.
  v_new_username := 'deleted_user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- Retained intentionally: tax_id_*, had_founder_subscription, had_free_trial,
  -- created_at, last_active_at, cancellation_strike_count.
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

  -- Private PII (name, contact, address, Stripe refs) lives in user_private.
  -- Removing the row is the anonymization.
  DELETE FROM public.user_private WHERE user_id = v_user_id;

  DELETE FROM public.push_tokens   WHERE user_id    = v_user_id;
  DELETE FROM public.saved_items   WHERE user_id    = v_user_id;
  DELETE FROM public.collections   WHERE seller_id  = v_user_id;
  DELETE FROM public.blocked_users WHERE blocker_id = v_user_id OR blocked_id = v_user_id;
  DELETE FROM public.notifications WHERE user_id    = v_user_id;

  RETURN jsonb_build_object(
    'already_deleted',   FALSE,
    'archived_listings', v_archived_listings,
    'new_username',      v_new_username
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_anonymize_user_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN jsonb_build_object(
    'already_deleted',   FALSE,
    'archived_listings', v_archived_listings,
    'new_username',      v_new_username
  );
END;
$$;

-- ── 5. Drop the moved columns from public.users ─────────────────────────────
ALTER TABLE public.users
  DROP COLUMN IF EXISTS full_name,
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS dob,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS postcode,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS stripe_account_id,
  DROP COLUMN IF EXISTS stripe_onboarding_complete,
  DROP COLUMN IF EXISTS seller_invite_code;
