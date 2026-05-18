DROP FUNCTION IF EXISTS public.increment_boosts_used(UUID);
DROP FUNCTION IF EXISTS public.decrement_boosts_used(UUID);

CREATE FUNCTION public.increment_boosts_used(p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_quota         CONSTANT INTEGER := 3;
  v_used          INTEGER;
  v_reset_at      TIMESTAMPTZ;
  v_now           TIMESTAMPTZ := NOW();
  v_next_reset    TIMESTAMPTZ;
BEGIN
  -- Refuse calls that target a user other than the caller. SECURITY DEFINER
  -- bypasses RLS, so we have to enforce this explicitly or any authenticated
  -- user could exhaust a competitor's free-boost quota.
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify another user''s boost counter';
  END IF;

  SELECT boosts_used, boosts_reset_at
    INTO v_used, v_reset_at
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_next_reset := (DATE_TRUNC('month', v_now AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC';

  IF v_reset_at IS NULL OR v_reset_at <= v_now THEN
    v_used     := 0;
    v_reset_at := v_next_reset;
  END IF;

  IF v_used >= v_quota THEN
    UPDATE public.users SET boosts_reset_at = v_reset_at WHERE id = p_user_id;
    RETURN FALSE;
  END IF;

  UPDATE public.users
     SET boosts_used     = v_used + 1,
         boosts_reset_at = v_reset_at
   WHERE id = p_user_id;

  RETURN TRUE;
END;
$function$;

CREATE FUNCTION public.decrement_boosts_used(p_user_id UUID)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Refuse calls that target a user other than the caller. Same reasoning
  -- as increment_boosts_used: SECURITY DEFINER bypasses RLS.
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot modify another user''s boost counter';
  END IF;

  UPDATE public.users
     SET boosts_used = GREATEST(0, boosts_used - 1)
   WHERE id = p_user_id;
END;
$function$;
