// Pure logic extracted from index.ts.
// No Deno or AWS dependencies — safe to import in Jest tests.

// ─── Clothing detection ───────────────────────────────────────────────────────

export const CLOTHING_ROOT_LABELS = new Set([
  'Clothing', 'Apparel', 'Fashion', 'Textile', 'Fabric',
  'Silk', 'Lace', 'Saree', 'Sari', 'Lehenga', 'Kurta', 'Dupatta',
]);

export interface RekognitionLabel {
  Name: string;
  Confidence: number;
  Parents?: { Name: string }[];
}

export function isClothingLabel(label: RekognitionLabel): boolean {
  if (CLOTHING_ROOT_LABELS.has(label.Name)) return true;
  return label.Parents?.some(p => p.Name === 'Clothing' || p.Name === 'Apparel') ?? false;
}

// ─── Label → app category mapping ────────────────────────────────────────────

export const LABEL_TO_CATEGORY: [string, string][] = [
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
  ['Gown',         'Lehenga'],
  ['Dress',        'Lehenga'],
  ['Skirt',        'Lehenga'],
  ['Suit',         'Sherwani'],
  ['Tuxedo',       'Sherwani'],
  ['Jacket',       'Nehru Jacket'],
  ['Blazer',       'Nehru Jacket'],
  ['Pants',        'Salwar'],
  ['Trousers',     'Salwar'],
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
  pink:   'Pink',
  orange: 'Other',
  yellow: 'Gold',
  green:  'Green',
  blue:   'Blue',
  purple: 'Other',
  white:  'White',
  black:  'Black',
  grey:   'Other',
  gray:   'Other',
  brown:  'Beige',
  beige:  'Beige',
  gold:   'Gold',
  maroon: 'Maroon',
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
