-- Taxonomy refresh — 2026-09-17.
--
-- Categories: + Salwar Kameez, Gown, Kurta Pajama, Jewellery, Accessories.
-- Colours: 11 → 19; Beige becomes Cream.
-- Fabrics: + Lawn, Organza, Satin, Crepe.  Occasions: + Festive.
-- Sizes: + One size.
--
-- Until now `listings.category` and `listings.colour` were free text, which
-- is how two listings kept the retired 'Partywear' category. This migrates
-- the stragglers and then pins every attribute to the list the app shows.
-- Changing a list in constants/theme.ts from here on means a migration that
-- updates the matching constraint — deliberately.

-- ── Data ────────────────────────────────────────────────────────────────────
UPDATE public.listings SET colour = 'Cream' WHERE colour = 'Beige';

-- Two lorem-ipsum test listings still on the retired 'Partywear' category.
UPDATE public.listings SET category = 'Casualwear' WHERE category = 'Partywear';

-- ── Constraints ─────────────────────────────────────────────────────────────
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_category_valid;
ALTER TABLE public.listings ADD CONSTRAINT listings_category_valid CHECK (category IN (
  'Lehenga', 'Saree', 'Anarkali', 'Salwar Kameez', 'Kurta', 'Sharara', 'Gown',
  'Dupatta', 'Blouse', 'Salwar',
  'Sherwani', 'Kurta Pajama', 'Achkan', 'Pathani Suit', 'Nehru Jacket',
  'Jewellery', 'Accessories', 'Casualwear', 'Shoes'
));

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_colour_valid;
ALTER TABLE public.listings ADD CONSTRAINT listings_colour_valid CHECK (colour IS NULL OR colour IN (
  'Black', 'White', 'Cream', 'Grey', 'Silver',
  'Red', 'Maroon', 'Pink', 'Peach', 'Orange', 'Yellow', 'Gold',
  'Green', 'Teal', 'Blue', 'Navy', 'Purple',
  'Multi', 'Other'
));

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_fabric_valid;
ALTER TABLE public.listings ADD CONSTRAINT listings_fabric_valid CHECK (fabric IS NULL OR fabric IN (
  'Silk', 'Chiffon', 'Georgette', 'Cotton', 'Lawn', 'Velvet', 'Net', 'Organza', 'Satin', 'Crepe', 'Brocade', 'Linen', 'Other'
));

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_occasion_valid;
ALTER TABLE public.listings ADD CONSTRAINT listings_occasion_valid CHECK (occasion IS NULL OR occasion IN (
  'Everyday', 'Eid', 'Diwali', 'Festive', 'Wedding', 'Mehndi', 'Party', 'Formal'
));
