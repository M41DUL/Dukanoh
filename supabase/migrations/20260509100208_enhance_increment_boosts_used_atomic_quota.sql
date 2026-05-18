DROP FUNCTION IF EXISTS public.increment_boosts_used(UUID);

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
  -- Lock the user row for atomic check-and-increment.
  SELECT boosts_used, boosts_reset_at
    INTO v_used, v_reset_at
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_next_reset := (DATE_TRUNC('month', v_now AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC';

  -- Roll the period forward atomically if the previous reset has passed
  -- (or was never seeded). Anything pre-reset is folded into the new period.
  IF v_reset_at IS NULL OR v_reset_at <= v_now THEN
    v_used     := 0;
    v_reset_at := v_next_reset;
  END IF;

  -- Quota exhausted: persist the rolled-forward reset_at (so future calls
  -- see the new period) but DO NOT increment, and tell the caller we
  -- couldn't grant a free boost so they can route to the IAP path.
  IF v_used >= v_quota THEN
    UPDATE public.users
       SET boosts_reset_at = v_reset_at
     WHERE id = p_user_id;
    RETURN FALSE;
  END IF;

  -- Free quota available: increment + persist new reset_at if rolled.
  UPDATE public.users
     SET boosts_used     = v_used + 1,
         boosts_reset_at = v_reset_at
   WHERE id = p_user_id;

  RETURN TRUE;
END;
$function$;
