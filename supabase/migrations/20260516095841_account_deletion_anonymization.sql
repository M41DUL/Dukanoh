-- Account deletion: guarded soft-delete with anonymization.
--
-- Replaces the previous hard-delete RPC. The user-facing semantic of "delete
-- my account" becomes: PII is scrubbed, the auth login is revoked, and a
-- minimal anonymized stub is retained so financial / tax records (HMRC 6yr,
-- DAC7) remain intact and the seller_wallet money-loss bug closes.
--
-- Two RPCs:
--   * check_deletion_readiness() — returns the list of blockers so the UI
--     can show what the user needs to resolve before deletion is allowed.
--   * anonymize_user_account()   — applies the destructive change inside
--     a single transaction; re-runs the guards under FOR UPDATE locks.
--
-- The Edge Function (supabase/functions/delete-account) orchestrates the
-- full flow: Stripe in-transit payout check, this RPC, auth ban + sign-out,
-- identity revocation, Stripe Connect close, storage cleanup.

-- ─── Schema changes ──────────────────────────────────────────────────────────

-- Allow 'deleted' as an account_status.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'warned', 'suspended', 'deleted'));

-- Tombstone timestamp. NULL = active account.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Defense in depth: refuse to drop a wallet row at the DB level. The RPC
-- already blocks deletion on non-zero balance; this guards against any
-- future code path that bypasses the RPC.
ALTER TABLE public.seller_wallet
  DROP CONSTRAINT IF EXISTS seller_wallet_seller_id_fkey;
ALTER TABLE public.seller_wallet
  ADD CONSTRAINT seller_wallet_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- Telemetry for the Edge Function's post-anonymize steps (auth ban, Stripe
-- close, storage purge). If any of those fail after the RPC commits, the
-- user is already anonymized from their POV — we just record the failure
-- here for ops follow-up. Service-role-only access.
CREATE TABLE IF NOT EXISTS public.deletion_failures (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID,                       -- no FK: user row may be gone in the future
  step        TEXT NOT NULL,              -- 'auth_ban' | 'auth_signout' | 'identity_revoke' | 'stripe_close' | 'storage_cleanup'
  error       TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.deletion_failures ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE INDEX IF NOT EXISTS idx_deletion_failures_user_id     ON public.deletion_failures (user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_failures_occurred_at ON public.deletion_failures (occurred_at DESC);


-- ─── RPC: check_deletion_readiness ────────────────────────────────────────────
-- Returns { blockers: [...] }. Empty array = ready to delete.
-- Each blocker has a `kind` for client deeplinking, a human-readable `message`,
-- and optional metadata (order_id, amount, resolve_at).

CREATE OR REPLACE FUNCTION public.check_deletion_readiness()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_blockers  JSONB := '[]'::JSONB;
  v_user      public.users%ROWTYPE;
  v_wallet    public.seller_wallet%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_user_id;
  IF NOT FOUND OR v_user.deleted_at IS NOT NULL THEN
    -- Already deleted or no profile row — nothing to do.
    RETURN jsonb_build_object('blockers', v_blockers);
  END IF;

  -- Official / admin accounts cannot self-delete.
  IF v_user.is_official THEN
    v_blockers := v_blockers || jsonb_build_object(
      'kind',    'official_account',
      'message', 'Official Dukanoh accounts cannot be deleted from the app. Contact support.'
    );
  END IF;

  -- Active Pro / founder subscription. Apple/Google rules require users to
  -- cancel via App Store / Play Store subscription settings — apps cannot
  -- cancel for them. Webhook-fed columns are the source of truth.
  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    v_blockers := v_blockers || jsonb_build_object(
      'kind',       'active_pro_subscription',
      'message',    'You have an active Dukanoh Pro subscription. Cancel it from your App Store or Play Store subscription settings before deleting your account.',
      'expires_at', v_user.pro_expires_at
    );
  END IF;

  -- Orders where the user is the buyer and the order is in flight.
  v_blockers := v_blockers || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind',     'active_order_buyer',
      'message',  CASE o.status
                    WHEN 'created'   THEN 'You have an order awaiting payment.'
                    WHEN 'paid'      THEN 'You have a paid order waiting to be shipped.'
                    WHEN 'shipped'   THEN 'You have an order in transit — confirm receipt or wait for delivery before deleting.'
                    WHEN 'delivered' THEN 'You have a delivered order pending confirmation.'
                    WHEN 'disputed'  THEN 'You have an open dispute that must be resolved first.'
                  END,
      'order_id', o.id,
      'status',   o.status
    ))
    FROM public.orders o
    WHERE o.buyer_id = v_user_id
      AND o.status IN ('created','paid','shipped','delivered','disputed')
  ), '[]'::JSONB);

  -- Orders where the user is the seller and the order is in flight.
  v_blockers := v_blockers || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind',     'active_order_seller',
      'message',  CASE o.status
                    WHEN 'created'   THEN 'You have a sale awaiting payment.'
                    WHEN 'paid'      THEN 'You have a paid order to ship.'
                    WHEN 'shipped'   THEN 'You have a shipment in transit.'
                    WHEN 'delivered' THEN 'You have a delivered order awaiting buyer confirmation.'
                    WHEN 'disputed'  THEN 'You have an open dispute that must be resolved first.'
                  END,
      'order_id', o.id,
      'status',   o.status
    ))
    FROM public.orders o
    WHERE o.seller_id = v_user_id
      AND o.status IN ('created','paid','shipped','delivered','disputed')
  ), '[]'::JSONB);

  -- Seller wallet balances. Pending = waiting for delivery confirmation;
  -- available = ready to payout. Both block deletion.
  SELECT * INTO v_wallet FROM public.seller_wallet WHERE seller_id = v_user_id;
  IF FOUND THEN
    IF v_wallet.pending_balance > 0 THEN
      -- resolve_at: earliest auto_release_at among shipped orders for this seller.
      v_blockers := v_blockers || jsonb_build_object(
        'kind',       'wallet_balance_pending',
        'message',    'You have a pending wallet balance from a recent sale. It will move to your available balance once the order completes.',
        'amount',     v_wallet.pending_balance,
        'resolve_at', (SELECT MIN(auto_release_at) FROM public.orders
                       WHERE seller_id = v_user_id AND status = 'shipped')
      );
    END IF;
    IF v_wallet.available_balance > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'kind',    'wallet_balance_available',
        'message', 'You have an available wallet balance. Request a payout from your wallet before deleting.',
        'amount', v_wallet.available_balance
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('blockers', v_blockers);
END;
$$;

REVOKE ALL ON FUNCTION public.check_deletion_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_deletion_readiness() TO authenticated;


-- ─── RPC: anonymize_user_account ──────────────────────────────────────────────
-- Destructive. Called by the delete-account Edge Function after it has
-- verified Stripe-side state (in-transit payouts). Re-runs guards inside
-- the transaction under a row lock so concurrent activity can't slip past.

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

  -- Lock the user row to serialize concurrent deletion attempts from
  -- multiple devices.
  SELECT * INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED:no_user';
  END IF;

  IF v_user.deleted_at IS NOT NULL THEN
    -- Already anonymized; treat as no-op so the Edge Function can be
    -- replayed safely if a later step previously failed.
    RETURN jsonb_build_object('already_deleted', TRUE);
  END IF;

  IF v_user.is_official THEN
    RAISE EXCEPTION 'BLOCKED:official_account';
  END IF;

  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    RAISE EXCEPTION 'BLOCKED:active_pro_subscription';
  END IF;

  -- Archive the user's available listings first. This closes the inbound-
  -- order path: no buyer can pay for one of these listings after this
  -- point, so the guard check below cannot race with a new order landing.
  UPDATE public.listings
     SET status = 'archived'
   WHERE seller_id = v_user_id
     AND status   = 'available';
  GET DIAGNOSTICS v_archived_listings = ROW_COUNT;

  -- Guard: active orders (buyer or seller side). Re-checked here under
  -- the user-row lock; rolls back the listings archive above on failure.
  SELECT id INTO v_active_order_id
  FROM public.orders
  WHERE (buyer_id = v_user_id OR seller_id = v_user_id)
    AND status IN ('created','paid','shipped','delivered','disputed')
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCKED:active_orders';
  END IF;

  -- Guard: seller wallet balances.
  SELECT * INTO v_wallet FROM public.seller_wallet
    WHERE seller_id = v_user_id FOR UPDATE;
  IF FOUND AND (v_wallet.pending_balance > 0 OR v_wallet.available_balance > 0) THEN
    RAISE EXCEPTION 'BLOCKED:wallet_balance';
  END IF;

  -- High-entropy retired username. Original username is NOT freed for
  -- reuse — that would let someone impersonate the deleted user in
  -- historical reviews and conversations.
  -- gen_random_uuid() instead of uuid_generate_v4(): the latter lives in the
  -- `extensions` schema which is excluded by SET search_path = public, so the
  -- call would error at runtime. gen_random_uuid() is built into Postgres core.
  v_new_username := 'deleted_user_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- Scrub PII. Retained intentionally:
  --   * tax_id_type, tax_id_number, tax_id_collected_at, tax_declaration_at
  --     — HMRC / DAC7 6-year retention requirement.
  --   * had_founder_subscription, had_free_trial — permanent eligibility
  --     markers; the user can't return as the same identity anyway.
  --   * created_at, last_active_at — non-identifying metadata.
  UPDATE public.users
     SET username                  = v_new_username,
         username_confirmed        = TRUE,
         full_name                 = 'Deleted user',
         first_name                = NULL,
         last_name                 = NULL,
         phone                     = NULL,
         dob                       = NULL,
         avatar_url                = NULL,
         bio                       = NULL,
         preferred_categories      = '{}',
         location                  = NULL,
         seller_invite_code        = NULL,
         address_line1             = NULL,
         address_line2             = NULL,
         city                      = NULL,
         postcode                  = NULL,
         country                   = NULL,
         stripe_account_id         = NULL,
         marketing_consent         = FALSE,
         marketing_push_consent    = FALSE,
         analytics_consent         = FALSE,
         sale_mode_active          = FALSE,
         sale_mode_discount_pct    = NULL,
         account_status            = 'deleted',
         deleted_at                = NOW()
   WHERE id = v_user_id;

  -- Tables we own that have no reason to persist past deletion.
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


-- ─── Retire the previous hard-delete RPC ──────────────────────────────────────
-- Callers (settings.tsx line 142) are being migrated to the Edge Function.
-- Drop it so any stale client build that still references it fails loudly
-- rather than silently destroying financial records.

DROP FUNCTION IF EXISTS public.delete_user_account();
