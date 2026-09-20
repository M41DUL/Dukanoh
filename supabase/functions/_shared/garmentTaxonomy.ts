// The taxonomy as the edge functions see it. A mirror of constants/theme.ts —
// __tests__/garmentTaxonomy.test.ts asserts the two match, so a list change
// in the app that isn't mirrored here fails the build instead of silently
// changing what the engine is allowed to answer.
//
// No Deno or app imports: safe for Jest and for every function.

export const CATEGORY_DEFINITIONS: Record<string, string> = {
  Lehenga:         'Skirt-based set, with or without blouse and dupatta',
  Saree:           'Saree, with or without blouse',
  Anarkali:        'Long flared frock-style set',
  'Salwar Kameez': 'Kameez with bottoms, with or without dupatta',
  Kurta:           'Kurta or kurti sold on its own',
  Sharara:         'Sharara or gharara, top included if a set',
  Gown:            'Indo-western gown or party dress',
  Dupatta:         'Dupatta or shawl on its own',
  Blouse:          'Blouse on its own',
  Salwar:          'Bottoms on their own: salwar, churidar, palazzo, pajama',
  Sherwani:        'Sherwani set',
  'Kurta Pajama':  'Kurta with matching bottoms sold as a set',
  Achkan:          'Achkan or Jodhpuri',
  'Pathani Suit':  'Pathani set',
  'Nehru Jacket':  'Nehru jacket, waistcoat or koti',
  Jewellery:       'Earrings, necklaces, tikka, bangles, sets, kalgi',
  Accessories:     'Bags and potlis, safa and turbans, belts, hair pieces, brooches',
  Casualwear:      'Everyday pieces that fit no other category',
  Shoes:           'Footwear',
};

export const CATEGORIES: readonly string[] = Object.keys(CATEGORY_DEFINITIONS);

export const CATEGORIES_BY_GENDER: Record<'Men' | 'Women', readonly string[]> = {
  Women: ['Lehenga', 'Saree', 'Anarkali', 'Salwar Kameez', 'Kurta', 'Sharara', 'Gown', 'Dupatta', 'Blouse', 'Salwar', 'Jewellery', 'Accessories', 'Casualwear', 'Shoes'],
  Men:   ['Sherwani', 'Kurta Pajama', 'Kurta', 'Achkan', 'Pathani Suit', 'Nehru Jacket', 'Salwar', 'Jewellery', 'Accessories', 'Casualwear', 'Shoes'],
};

export const COLOURS: readonly string[] = [
  'Black', 'White', 'Cream', 'Grey', 'Silver',
  'Red', 'Maroon', 'Pink', 'Peach', 'Orange', 'Yellow', 'Gold',
  'Green', 'Teal', 'Blue', 'Navy', 'Purple',
  'Multi', 'Other',
];

export const OCCASIONS: readonly string[] = ['Everyday', 'Eid', 'Diwali', 'Festive', 'Wedding', 'Mehndi', 'Party', 'Formal'];
export const GENDERS: readonly string[] = ['Men', 'Women'];
export const FABRICS: readonly string[] = ['Silk', 'Chiffon', 'Georgette', 'Cotton', 'Lawn', 'Velvet', 'Net', 'Organza', 'Satin', 'Crepe', 'Brocade', 'Linen', 'Other'];
export const SIZES: readonly string[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size', 'Custom'];
export const CONDITIONS: readonly string[] = ['New', 'Excellent', 'Good', 'Fair'];
export const FABRIC_WEIGHTS: readonly string[] = ['Light', 'Structured', 'Heavy'];

/** Bump when the lists above change shape, so rows can be filtered by era. */
export const TAXONOMY_VERSION = 2;
