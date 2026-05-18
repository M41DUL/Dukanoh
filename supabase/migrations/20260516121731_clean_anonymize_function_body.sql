-- Remove the redundant in-function backfill that ran on every deletion call
-- (the one-off UPDATE in the previous migration already cleaned existing
-- rows; running it again every time is a tiny waste).

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
         full_name                 = 'Deleted member',
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
