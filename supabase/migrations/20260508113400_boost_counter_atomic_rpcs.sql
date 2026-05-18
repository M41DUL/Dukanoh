-- Atomic +1/-1 on users.boosts_used so concurrent boost taps don't both read
-- the same value and clobber each other's increment. Increment also seeds
-- boosts_reset_at (UTC midnight, first of next month) when null so the monthly
-- reset cron has a deadline to compare against.

CREATE OR REPLACE FUNCTION public.increment_boosts_used(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET
    boosts_used = boosts_used + 1,
    boosts_reset_at = COALESCE(
      boosts_reset_at,
      (DATE_TRUNC('month', (NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month')) AT TIME ZONE 'UTC'
    )
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decrement_boosts_used(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET boosts_used = GREATEST(0, boosts_used - 1)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
