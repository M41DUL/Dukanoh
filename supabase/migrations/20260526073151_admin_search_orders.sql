-- Server-side search for the admin Orders page. Previously the page selected
-- the most-recent 100 orders and filtered by `q` in JS — so searching for
-- anything older than the 100th most-recent row silently returned nothing.
-- This RPC pushes the search into the DB so the 100-row limit applies after
-- filtering, not before.

CREATE OR REPLACE FUNCTION public.admin_search_orders(
  p_q TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  item_price NUMERIC,
  protection_fee NUMERIC,
  total_paid NUMERIC,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  listing_title TEXT,
  buyer_username TEXT,
  seller_username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q_lower TEXT := LOWER(NULLIF(TRIM(p_q), ''));
BEGIN
  RETURN QUERY
    SELECT
      o.id,
      o.status,
      o.item_price,
      o.protection_fee,
      o.total_paid,
      o.created_at,
      o.completed_at,
      o.disputed_at,
      o.cancelled_at,
      l.title AS listing_title,
      bu.username AS buyer_username,
      su.username AS seller_username
    FROM public.orders o
    LEFT JOIN public.listings l ON l.id = o.listing_id
    LEFT JOIN public.users    bu ON bu.id = o.buyer_id
    LEFT JOIN public.users    su ON su.id = o.seller_id
    WHERE
      (p_status IS NULL OR p_status = 'all' OR o.status = p_status)
      AND (p_from IS NULL OR o.created_at >= p_from)
      AND (p_to IS NULL OR o.created_at <= p_to)
      AND (
        q_lower IS NULL
        OR LOWER(o.id::TEXT) LIKE q_lower || '%'
        OR LOWER(COALESCE(l.title, '')) LIKE '%' || q_lower || '%'
        OR LOWER(COALESCE(bu.username, '')) LIKE '%' || q_lower || '%'
        OR LOWER(COALESCE(su.username, '')) LIKE '%' || q_lower || '%'
      )
    ORDER BY o.created_at DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_orders(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_orders(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;
