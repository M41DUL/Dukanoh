-- ============================================================
-- Admin cost-efficiency optimizations
--
-- 1. Function: generate_due_recurring_expenses()
--    Moves the per-template loop from TypeScript into a single
--    DB call. Idempotent — safe to invoke from page render or cron.
--
-- 2. View: admin_finance_summary
--    Returns a single row containing every KPI the finance overview
--    page needs. Replaces four full-table scans with one query.
--
-- 3. View: admin_ledger_monthly
--    Pre-aggregated monthly revenue (last 12 months). Replaces the
--    JS reduce() over the full platform_ledger table.
--
-- 4. View: admin_boosts_summary
--    Pre-aggregated lifetime + 30-day boost revenue and counts.
--
-- 5. Function: get_top_boosters(days, limit)
--    Top sellers by boost spend in the last N days.
--
-- 6. Function: get_admin_nav_counts()
--    Replaces the five count(*) queries in the admin layout with one
--    round trip.
--
-- 7. Optional: pg_cron schedule for generate_due_recurring_expenses().
--    Best-effort — if pg_cron is not enabled, the function is still
--    callable manually and the admin expenses page falls back to
--    calling it on render.
-- ============================================================


-- 1. SQL implementation of recurring expense generator.
CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl              RECORD;
  v_today          DATE := CURRENT_DATE;
  v_year           INT;
  v_month          INT;
  v_clamped_day    INT;
  v_month_end_day  INT;
  v_target_date    DATE;
  v_last_ym        TEXT;
  v_inserted_total INT := 0;
BEGIN
  FOR tpl IN
    SELECT id, category, description, amount, day_of_month,
           receipt_url, last_generated_ym, created_at
    FROM public.admin_recurring_expenses
    WHERE active = TRUE
  LOOP
    -- Starting month: month after last_generated_ym, or the creation month.
    IF tpl.last_generated_ym IS NOT NULL THEN
      v_year  := split_part(tpl.last_generated_ym, '-', 1)::INT;
      v_month := split_part(tpl.last_generated_ym, '-', 2)::INT + 1;
      IF v_month > 12 THEN
        v_month := 1;
        v_year  := v_year + 1;
      END IF;
    ELSE
      v_year  := EXTRACT(YEAR  FROM tpl.created_at)::INT;
      v_month := EXTRACT(MONTH FROM tpl.created_at)::INT;
    END IF;

    v_last_ym := NULL;

    -- Walk month-by-month up to (and including) the current month.
    WHILE make_date(v_year, v_month, 1) <= date_trunc('month', v_today)::date LOOP
      v_month_end_day := EXTRACT(DAY FROM
        (date_trunc('month', make_date(v_year, v_month, 1)) + INTERVAL '1 month' - INTERVAL '1 day')::date
      )::INT;
      v_clamped_day := LEAST(tpl.day_of_month, v_month_end_day);

      -- For the current month, only generate once the day-of-month has been reached.
      IF v_year  = EXTRACT(YEAR  FROM v_today)::INT
         AND v_month = EXTRACT(MONTH FROM v_today)::INT
         AND EXTRACT(DAY FROM v_today)::INT < v_clamped_day THEN
        EXIT;
      END IF;

      v_target_date := make_date(v_year, v_month, v_clamped_day);

      INSERT INTO public.admin_expenses (date, category, description, amount, receipt_url, recurring_id)
      VALUES (v_target_date, tpl.category, tpl.description, tpl.amount, tpl.receipt_url, tpl.id);

      v_inserted_total := v_inserted_total + 1;
      v_last_ym := to_char(v_target_date, 'YYYY-MM');

      v_month := v_month + 1;
      IF v_month > 12 THEN
        v_month := 1;
        v_year  := v_year + 1;
      END IF;
    END LOOP;

    IF v_last_ym IS NOT NULL THEN
      UPDATE public.admin_recurring_expenses
         SET last_generated_ym = v_last_ym
       WHERE id = tpl.id;
    END IF;
  END LOOP;

  RETURN v_inserted_total;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO service_role;


-- 2. Finance KPI summary — one-row aggregate of every dashboard metric.
CREATE OR REPLACE VIEW public.admin_finance_summary AS
SELECT
  COALESCE((SELECT SUM(amount)::NUMERIC FROM public.platform_ledger), 0)
    AS all_time_revenue,
  COALESCE((SELECT SUM(amount)::NUMERIC FROM public.platform_ledger
            WHERE created_at >= date_trunc('month', NOW())), 0)
    AS mtd_revenue,
  COALESCE((SELECT SUM(amount)::NUMERIC FROM public.admin_expenses), 0)
    AS all_time_expenses,
  COALESCE((SELECT SUM(amount)::NUMERIC FROM public.admin_expenses
            WHERE date >= date_trunc('month', NOW())::date), 0)
    AS mtd_expenses,
  COALESCE((SELECT SUM(item_price)::NUMERIC FROM public.orders
            WHERE status = 'completed'), 0)
    AS gmv,
  COALESCE((SELECT SUM(total_paid)::NUMERIC FROM public.orders
            WHERE status IN ('paid','shipped')), 0)
    AS active_escrow,
  COALESCE((SELECT COUNT(*)::INT FROM public.orders
            WHERE status = 'cancelled' AND disputed_at IS NOT NULL), 0)
    AS refund_count,
  COALESCE((SELECT SUM(item_price)::NUMERIC FROM public.orders
            WHERE status = 'cancelled' AND disputed_at IS NOT NULL), 0)
    AS refund_value;

REVOKE ALL ON public.admin_finance_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_finance_summary TO service_role;


-- 3. Monthly revenue (last 12 months).
CREATE OR REPLACE VIEW public.admin_ledger_monthly AS
SELECT
  to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
  SUM(amount)::NUMERIC                                AS revenue
FROM public.platform_ledger
WHERE created_at >= (date_trunc('month', NOW()) - INTERVAL '11 months')
GROUP BY 1;

REVOKE ALL ON public.admin_ledger_monthly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_ledger_monthly TO service_role;


-- 4. Boosts summary view.
CREATE OR REPLACE VIEW public.admin_boosts_summary AS
SELECT
  COALESCE(SUM(amount_paid)::NUMERIC, 0)
    AS all_time_revenue,
  COALESCE(SUM(amount_paid) FILTER (WHERE boosted_at >= NOW() - INTERVAL '30 days')::NUMERIC, 0)
    AS thirty_day_revenue,
  COALESCE(COUNT(*) FILTER (WHERE boosted_at >= NOW() - INTERVAL '30 days')::INT, 0)
    AS thirty_day_count,
  COALESCE(COUNT(*) FILTER (WHERE expires_at > NOW())::INT, 0)
    AS active_count
FROM public.boosts;

REVOKE ALL ON public.admin_boosts_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_boosts_summary TO service_role;


-- 5. Top boosters by spend in the last N days.
CREATE OR REPLACE FUNCTION public.get_top_boosters(p_days INT DEFAULT 30, p_limit INT DEFAULT 5)
RETURNS TABLE (
  seller_id   UUID,
  username    TEXT,
  boost_count INT,
  spent       NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id            AS seller_id,
    u.username,
    COUNT(b.*)::INT AS boost_count,
    COALESCE(SUM(b.amount_paid), 0)::NUMERIC AS spent
  FROM public.boosts b
  JOIN public.users u ON u.id = b.seller_id
  WHERE b.boosted_at >= NOW() - (p_days::TEXT || ' days')::INTERVAL
  GROUP BY u.id, u.username
  ORDER BY spent DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_top_boosters(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_boosters(INT, INT) TO service_role;


-- 6. Admin nav badge counts — definition removed from this migration on
-- 2026-05-17 during a migration-history reconciliation. Later migrations
-- (account_deletion_requests, feedback_replies) extended this function with
-- additional columns. Redefining it here with the original 5-column shape
-- would either (a) fail with "cannot change return type" when applied on
-- top of the live extended function, or (b) regress the function on a fresh
-- DB. The function is owned by whichever later migration defines it last;
-- this slot intentionally left blank.


-- 7. Schedule daily run of generate_due_recurring_expenses().
-- Best-effort: if pg_cron is not available, the migration still succeeds
-- and the admin expenses page falls back to calling the RPC on render.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions';
  EXECUTE 'SELECT cron.unschedule(''admin-recurring-expenses-daily'')';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  EXECUTE $cmd$
    SELECT cron.schedule(
      'admin-recurring-expenses-daily',
      '5 2 * * *',
      'SELECT public.generate_due_recurring_expenses();'
    )
  $cmd$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable — generate_due_recurring_expenses() must be invoked manually or via the admin expenses page.';
END;
$$;
