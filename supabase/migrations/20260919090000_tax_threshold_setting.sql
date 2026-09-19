-- UK PIRRR 2023 / DAC7 sterling threshold as a setting.
--
-- The legal threshold is 30 sales or €2,000 per calendar year. The app and the
-- admin console each had their own hand-typed sterling stand-in (1690 in the
-- triggers/app, 1700 in the admin DAC7 count and Tax Report). Both now read
-- platform_settings so a January exchange-rate review is a one-field change:
--   tax_gross_threshold_gbp  pause listings / ask for details (and count as reportable)
--   tax_warn_gross_gbp       show the approaching-threshold banner
-- Sales counts stay fixed: ask at 29 (so the 30th cannot happen without a TIN),
-- warn from 25, report at 30.

INSERT INTO public.platform_settings (key, value) VALUES
  ('tax_gross_threshold_gbp', '1690'),
  ('tax_warn_gross_gbp', '1500')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tax_gross_threshold_gbp()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(value, '')::numeric FROM public.platform_settings WHERE key = 'tax_gross_threshold_gbp'),
    1690
  );
$$;

GRANT EXECUTE ON FUNCTION public.tax_gross_threshold_gbp() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_order_tax_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_year_start  TIMESTAMPTZ := DATE_TRUNC('year', NOW());
  v_year_count  INT;
  v_year_sales  NUMERIC;
  v_has_tin     BOOLEAN;
BEGIN
  -- Only fire when an order transitions to completed
  IF NOT (OLD.status IN ('shipped', 'delivered') AND NEW.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(item_price), 0)
    INTO v_year_count, v_year_sales
    FROM public.orders
   WHERE seller_id = NEW.seller_id
     AND status    = 'completed'
     AND created_at >= v_year_start;

  IF v_year_count >= 29 OR v_year_sales >= public.tax_gross_threshold_gbp() THEN
    SELECT (tax_id_collected_at IS NOT NULL)
      INTO v_has_tin
      FROM public.users
     WHERE id = NEW.seller_id;

    IF NOT v_has_tin THEN
      UPDATE public.users
         SET tax_hold = TRUE
       WHERE id = NEW.seller_id AND tax_hold = FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

  IF (v_count >= 29 OR v_sales >= public.tax_gross_threshold_gbp())
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
