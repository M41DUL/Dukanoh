-- Admin-initiated variants of the account deletion RPCs. Same guards and
-- scrub logic as the user-facing functions (check_deletion_readiness /
-- anonymize_user_account) but take the target user_id as a parameter so the
-- /admin/account-deletion view can one-click delete from a web request.
--
-- Both functions are service-role only. The web admin API route gates these
-- behind the admin_session + CSRF cookie before invoking them.

CREATE OR REPLACE FUNCTION public.admin_check_deletion_readiness(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blockers  JSONB := '[]'::JSONB;
  v_user      public.users%ROWTYPE;
  v_wallet    public.seller_wallet%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('blockers', v_blockers);
  END IF;

  IF v_user.is_official THEN
    v_blockers := v_blockers || jsonb_build_object(
      'kind',    'official_account',
      'message', 'Official Dukanoh accounts cannot be deleted. Contact engineering.'
    );
  END IF;

  IF v_user.pro_expires_at IS NOT NULL AND v_user.pro_expires_at > NOW() THEN
    v_blockers := v_blockers || jsonb_build_object(
      'kind',       'active_pro_subscription',
      'message',    'User has an active Dukanoh Pro subscription. Must be cancelled via App Store / Play Store before deletion.',
      'expires_at', v_user.pro_expires_at
    );
  END IF;

  v_blockers := v_blockers || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind',     'active_order_buyer',
      'message',  CASE o.status
                    WHEN 'created'   THEN 'User has an order awaiting payment.'
                    WHEN 'paid'      THEN 'User has a paid order waiting to be shipped.'
                    WHEN 'shipped'   THEN 'User has an order in transit.'
                    WHEN 'delivered' THEN 'User has a delivered order pending confirmation.'
                    WHEN 'disputed'  THEN 'User has an open dispute that must be resolved first.'
                  END,
      'order_id', o.id,
      'status',   o.status
    ))
    FROM public.orders o
    WHERE o.buyer_id = p_user_id
      AND o.status IN ('created','paid','shipped','delivered','disputed')
  ), '[]'::JSONB);

  v_blockers := v_blockers || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind',     'active_order_seller',
      'message',  CASE o.status
                    WHEN 'created'   THEN 'User has a sale awaiting payment.'
                    WHEN 'paid'      THEN 'User has a paid order to ship.'
                    WHEN 'shipped'   THEN 'User has a shipment in transit.'
                    WHEN 'delivered' THEN 'User has a delivered order awaiting buyer confirmation.'
                    WHEN 'disputed'  THEN 'User has an open dispute that must be resolved first.'
                  END,
      'order_id', o.id,
      'status',   o.status
    ))
    FROM public.orders o
    WHERE o.seller_id = p_user_id
      AND o.status IN ('created','paid','shipped','delivered','disputed')
  ), '[]'::JSONB);

  SELECT * INTO v_wallet FROM public.seller_wallet WHERE seller_id = p_user_id;
  IF FOUND THEN
    IF v_wallet.pending_balance > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'kind',       'wallet_balance_pending',
        'message',    'User has a pending wallet balance from a recent sale. Will move to available once the order completes.',
        'amount',     v_wallet.pending_balance,
        'resolve_at', (SELECT MIN(auto_release_at) FROM public.orders
                       WHERE seller_id = p_user_id AND status = 'shipped')
      );
    END IF;
    IF v_wallet.available_balance > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'kind',    'wallet_balance_available',
        'message', 'User has an available wallet balance. Must request a payout before deletion.',
        'amount', v_wallet.available_balance
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('blockers', v_blockers);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_check_deletion_readiness(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_check_deletion_readiness(UUID) TO service_role;


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
   WHERE id = p_user_id;

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

REVOKE ALL ON FUNCTION public.admin_anonymize_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_anonymize_user_account(UUID) TO service_role;
