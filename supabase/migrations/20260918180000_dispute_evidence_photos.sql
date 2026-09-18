-- Photo evidence for disputes and appeals (Terms 8.3, 13.1, 13.2).
--
-- BEFORE: dispute_evidence existed but nothing wrote to it; the dispute and
-- appeal forms were text only, and the Terms told buyers to "provide
-- photographic evidence" they had no way to attach.
--
-- AFTER: a private bucket `dispute-evidence`. Either party to an order can add
-- photos while the order is shipped/delivered (raising), disputed (open) or
-- resolved (appeal window); rows carry the stage. Files are rendered through
-- signed URLs only. image_url holds the object path inside the bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-evidence', 'dispute-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- ── Table: stage + who may add ────────────────────────────────────────────
ALTER TABLE public.dispute_evidence
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'dispute'
    CHECK (stage IN ('dispute', 'appeal'));

COMMENT ON COLUMN public.dispute_evidence.image_url IS
  'Object path inside the private dispute-evidence bucket (order_id/file.jpg). Render via a signed URL.';

-- Party to the order (buyer or seller)?
CREATE OR REPLACE FUNCTION public.is_order_party(p_order_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = p_order_id
       AND (o.buyer_id = (select auth.uid()) OR o.seller_id = (select auth.uid()))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Party AND the order is at a stage where evidence makes sense.
CREATE OR REPLACE FUNCTION public.can_add_dispute_evidence(p_order_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = p_order_id
       AND (o.buyer_id = (select auth.uid()) OR o.seller_id = (select auth.uid()))
       AND o.status IN ('shipped', 'delivered', 'disputed', 'resolved')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL    ON FUNCTION public.is_order_party(UUID)            FROM PUBLIC, anon;
REVOKE ALL    ON FUNCTION public.can_add_dispute_evidence(UUID)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_order_party(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_add_dispute_evidence(UUID)  TO authenticated;

DROP POLICY IF EXISTS "Buyers can upload dispute evidence" ON public.dispute_evidence;
CREATE POLICY "Parties can add dispute evidence"
  ON public.dispute_evidence FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND public.can_add_dispute_evidence(order_id)
  );

-- ── Storage: objects live under <order_id>/ ───────────────────────────────
-- The first path segment must be an order the caller is party to. A malformed
-- first segment fails the uuid regex and is refused.
CREATE OR REPLACE FUNCTION public.dispute_evidence_order_id(p_name TEXT)
RETURNS UUID AS $$
  SELECT CASE
    WHEN split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(p_name, '/', 1)::uuid
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE;

DROP POLICY IF EXISTS "Parties can upload dispute evidence" ON storage.objects;
CREATE POLICY "Parties can upload dispute evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND public.can_add_dispute_evidence(public.dispute_evidence_order_id(name))
  );

DROP POLICY IF EXISTS "Parties can read dispute evidence" ON storage.objects;
CREATE POLICY "Parties can read dispute evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND public.is_order_party(public.dispute_evidence_order_id(name))
  );
