-- Reports can target a member as well as a listing (Terms 12/17, Legal →
-- Transparency Report). The profile "Report" button previously saved nothing
-- because every report had to point at a listing.
--
-- seller_id is the reported member for both kinds (kept for compatibility with
-- the admin queue); listing_id is required for listing reports and NULL for
-- member reports. One report per reporter per target, per kind.

ALTER TABLE public.reports ALTER COLUMN listing_id DROP NOT NULL;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'listing'
    CHECK (target IN ('listing', 'user'));

COMMENT ON COLUMN public.reports.seller_id IS 'The reported member (listing owner for listing reports, the profile for member reports).';
COMMENT ON COLUMN public.reports.target IS 'listing: about a listing (listing_id set). user: about a member (listing_id NULL).';

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_shape;
ALTER TABLE public.reports ADD CONSTRAINT reports_target_shape
  CHECK ((target = 'listing' AND listing_id IS NOT NULL) OR (target = 'user' AND listing_id IS NULL));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_not_self;
ALTER TABLE public.reports ADD CONSTRAINT reports_not_self
  CHECK (reporter_id <> seller_id) NOT VALID;

-- Replace the table-level UNIQUE (reporter_id, listing_id) with per-kind
-- partial unique indexes.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.reports'::regclass AND contype = 'u' LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_listing
  ON public.reports (reporter_id, listing_id) WHERE target = 'listing';
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_per_member
  ON public.reports (reporter_id, seller_id) WHERE target = 'user';
