// Pure logic extracted from index.ts.
// No Deno or AWS dependencies — safe to import in Jest tests.

// ─── Clothing detection ───────────────────────────────────────────────────────

export const CLOTHING_ROOT_LABELS = new Set([
  'Clothing', 'Apparel', 'Fashion', 'Textile', 'Fabric',
  'Silk', 'Lace', 'Saree', 'Sari', 'Lehenga', 'Kurta', 'Dupatta',
  // Jewellery, Accessories and Shoes are listable categories, so their
  // Rekognition roots pass the "is this a listable item" gate too.
  'Jewelry', 'Accessories', 'Footwear', 'Handbag', 'Bag',
]);

export interface RekognitionLabel {
  Name: string;
  Confidence: number;
  Parents?: { Name: string }[];
}

export function isClothingLabel(label: RekognitionLabel): boolean {
  if (CLOTHING_ROOT_LABELS.has(label.Name)) return true;
  return label.Parents?.some(p => ['Clothing', 'Apparel', 'Accessories', 'Footwear', 'Jewelry'].includes(p.Name)) ?? false;
}

// ─── Label → app category mapping ────────────────────────────────────────────

export const LABEL_TO_CATEGORY: [string, string][] = [
  // Named South Asian garments first — Rekognition rarely returns them, but
  // when it does they beat every generic label below.
  ['Lehenga',      'Lehenga'],
  ['Lehnga',       'Lehenga'],
  ['Saree',        'Saree'],
  ['Sari',         'Saree'],
  ['Anarkali',     'Anarkali'],
  ['Sherwani',     'Sherwani'],
  ['Dupatta',      'Dupatta'],
  ['Scarf',        'Dupatta'],
  ['Shawl',        'Dupatta'],
  ['Veil',         'Dupatta'],
  ['Blouse',       'Blouse'],
  ['Kurta',        'Kurta'],
  ['Shirt',        'Kurta'],
  ['Top',          'Kurta'],
  ['Tunic',        'Kurta'],
  ['Gown',         'Gown'],
  ['Evening Dress', 'Gown'],
  ['Dress',        'Lehenga'],
  ['Skirt',        'Lehenga'],
  ['Suit',         'Sherwani'],
  ['Tuxedo',       'Sherwani'],
  ['Jacket',       'Nehru Jacket'],
  ['Blazer',       'Nehru Jacket'],
  ['Vest',         'Nehru Jacket'],
  ['Pants',        'Salwar'],
  ['Trousers',     'Salwar'],
  // Non-garment categories last, so a photo of an outfit with jewellery on
  // it still reads as the outfit.
  ['Jewelry',      'Jewellery'],
  ['Necklace',     'Jewellery'],
  ['Earring',      'Jewellery'],
  ['Bracelet',     'Jewellery'],
  ['Bangles',      'Jewellery'],
  ['Ring',         'Jewellery'],
  ['Handbag',      'Accessories'],
  ['Purse',        'Accessories'],
  ['Bag',          'Accessories'],
  ['Turban',       'Accessories'],
  ['Belt',         'Accessories'],
  ['Shoe',         'Shoes'],
  ['Footwear',     'Shoes'],
  ['Sandal',       'Shoes'],
];

export function detectCategory(labels: string[]): string | null {
  const labelSet = new Set(labels);
  for (const [rekLabel, appCategory] of LABEL_TO_CATEGORY) {
    if (labelSet.has(rekLabel)) return appCategory;
  }
  return null;
}

// ─── Rekognition SimplifiedColor → app colour mapping ────────────────────────

export const SIMPLIFIED_TO_COLOUR: Record<string, string> = {
  red:    'Red',
  maroon: 'Maroon',
  pink:   'Pink',
  peach:  'Peach',
  orange: 'Orange',
  yellow: 'Yellow',
  gold:   'Gold',
  green:  'Green',
  teal:   'Teal',
  blue:   'Blue',
  navy:   'Navy',
  purple: 'Purple',
  white:  'White',
  cream:  'Cream',
  beige:  'Cream',
  brown:  'Other',
  grey:   'Grey',
  gray:   'Grey',
  silver: 'Silver',
  black:  'Black',
};

export function detectColour(dominantColors: { SimplifiedColor?: string; PixelPercent?: number }[]): string | null {
  for (const c of dominantColors) {
    const simplified = c.SimplifiedColor?.toLowerCase();
    if (simplified && SIMPLIFIED_TO_COLOUR[simplified]) {
      return SIMPLIFIED_TO_COLOUR[simplified];
    }
  }
  return null;
}
