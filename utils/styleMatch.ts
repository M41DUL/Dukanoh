/**
 * Dukanoh Fit — style matching utility
 *
 * Provides:
 * - Complementary category map (base piece → what to suggest)
 * - Colour compatibility map (primary +2, secondary +1 scores); neutrals pair
 *   with every base colour
 * - Fabric → weight mapping and weight compatibility (there is no
 *   fabric_weight column — `listings.fabric` is the only source)
 * - Gender inference from the base category (Kurta, Salwar, Jewellery and
 *   Accessories sit under both genders and are ambiguous)
 * - scoreMatch() — scores a candidate listing against a base piece
 */

import { CategoriesByGender, type Gender } from '@/constants/theme';

// ─── Complementary category map ─────────────────────────────────────────────

export const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  // Women
  Lehenga:         ['Dupatta', 'Blouse', 'Jewellery', 'Accessories'],
  Saree:           ['Blouse', 'Jewellery', 'Accessories'],
  Anarkali:        ['Dupatta', 'Salwar', 'Sharara', 'Jewellery'],
  'Salwar Kameez': ['Dupatta', 'Jewellery', 'Accessories'],
  Kurta:           ['Dupatta', 'Salwar', 'Sharara', 'Nehru Jacket', 'Jewellery'],
  Sharara:         ['Kurta', 'Anarkali', 'Dupatta', 'Jewellery'],
  Gown:            ['Jewellery', 'Accessories', 'Dupatta'],
  Dupatta:         ['Lehenga', 'Anarkali', 'Salwar Kameez', 'Kurta', 'Saree'],
  Blouse:          ['Saree', 'Lehenga'],
  Salwar:          ['Kurta', 'Achkan', 'Sherwani', 'Pathani Suit'],
  // Men
  Sherwani:        ['Kurta', 'Salwar', 'Accessories', 'Jewellery'],
  'Kurta Pajama':  ['Nehru Jacket', 'Accessories'],
  Achkan:          ['Kurta', 'Salwar', 'Accessories'],
  'Pathani Suit':  ['Salwar', 'Accessories'],
  'Nehru Jacket':  ['Kurta', 'Kurta Pajama'],
  // Both
  Jewellery:       ['Lehenga', 'Saree', 'Anarkali', 'Salwar Kameez', 'Gown', 'Sharara', 'Sherwani'],
  Accessories:     ['Lehenga', 'Saree', 'Salwar Kameez', 'Gown', 'Sherwani', 'Achkan', 'Kurta Pajama'],
};

// ─── Colour compatibility map ────────────────────────────────────────────────

interface ColourCompatibility {
  primary: string[];   // +2 score
  secondary: string[]; // +1 score
}

export const COLOUR_MAP: Record<string, ColourCompatibility> = {
  Red:    { primary: ['Gold', 'Maroon', 'Green'],          secondary: ['Pink', 'Black', 'Orange', 'Navy'] },
  Maroon: { primary: ['Gold', 'Pink', 'Cream'],            secondary: ['Red', 'Peach', 'Green', 'Silver'] },
  Pink:   { primary: ['Gold', 'Cream', 'Silver'],          secondary: ['Red', 'Multi', 'Peach', 'Green', 'Teal'] },
  Peach:  { primary: ['Gold', 'Cream', 'Teal'],            secondary: ['Pink', 'Green', 'Silver', 'Maroon'] },
  Orange: { primary: ['Gold', 'Cream', 'Navy'],            secondary: ['Green', 'Pink', 'Teal', 'Red'] },
  Yellow: { primary: ['Gold', 'Green', 'Navy'],            secondary: ['Pink', 'Purple', 'Orange'] },
  Gold:   { primary: ['Red', 'Maroon', 'Green', 'Navy', 'Purple'], secondary: ['Blue', 'Pink', 'Teal', 'Black', 'Orange'] },
  Green:  { primary: ['Gold', 'Cream', 'Pink'],            secondary: ['Multi', 'Yellow', 'Orange', 'Peach', 'Maroon'] },
  Teal:   { primary: ['Gold', 'Cream', 'Peach'],           secondary: ['Pink', 'Orange', 'Silver', 'Navy'] },
  Blue:   { primary: ['Gold', 'Cream', 'Silver'],          secondary: ['Multi', 'Peach', 'Pink', 'Navy'] },
  Navy:   { primary: ['Gold', 'Cream', 'Silver'],          secondary: ['Red', 'Orange', 'Yellow', 'Pink', 'Teal'] },
  Purple: { primary: ['Gold', 'Silver', 'Cream'],          secondary: ['Pink', 'Yellow', 'Green', 'Grey'] },
  Black:  { primary: ['Gold', 'White', 'Silver'],          secondary: ['Cream', 'Multi', 'Red', 'Pink', 'Grey'] },
  Grey:   { primary: ['Silver', 'Pink', 'Navy'],           secondary: ['Black', 'Teal', 'Purple', 'Maroon'] },
  Silver: { primary: ['Navy', 'Purple', 'Black'],          secondary: ['Blue', 'Pink', 'Grey', 'Teal'] },
  Multi:  { primary: ['Cream', 'White', 'Black', 'Gold'],  secondary: ['Silver'] },
  Cream:  { primary: [],                                   secondary: [] }, // neutral — matches everything
  White:  { primary: [],                                   secondary: [] }, // neutral — matches everything
  Other:  { primary: [],                                   secondary: [] }, // unknown — no filter applied
};

/** Base colours that pair with everything — no colour filter is applied. */
// Cream replaced Beige in the 2026-09 taxonomy refresh.
const NEUTRAL_BASE_COLOURS = new Set(['Cream', 'White', 'Other']);

/** Candidate colours that pair with every non-neutral base (secondary tier). */
const NEUTRAL_CANDIDATE_COLOURS = ['Cream', 'White'];

/**
 * Fewer strict (colour-compatible) results than this and the search is
 * widened to pieces whose colour is unknown or outside the compatible set.
 */
export const MIN_STRICT_RESULTS = 8;

// ─── Fabric weight ───────────────────────────────────────────────────────────

export type FabricWeight = 'Light' | 'Structured' | 'Heavy';

export const FABRIC_WEIGHT_COMPAT: Record<FabricWeight, FabricWeight[]> = {
  Light:      ['Light', 'Structured'],
  Structured: ['Light', 'Structured', 'Heavy'],
  Heavy:      ['Structured', 'Heavy'],
};

/** `listings.fabric` → weight. 'Other' and unset fabrics have no weight. */
const FABRIC_TO_WEIGHT: Record<string, FabricWeight> = {
  Chiffon:   'Light',
  Georgette: 'Light',
  Net:       'Light',
  Lawn:      'Light',
  Satin:     'Light',
  Crepe:     'Light',
  Silk:      'Structured',
  Cotton:    'Structured',
  Linen:     'Structured',
  Organza:   'Structured',
  Velvet:    'Heavy',
  Brocade:   'Heavy',
};

export function fabricToWeight(fabric?: string | null): FabricWeight | undefined {
  if (!fabric) return undefined;
  return FABRIC_TO_WEIGHT[fabric];
}

// ─── Gender ──────────────────────────────────────────────────────────────────

/**
 * Who wears this category. Returns null when the category is listed under
 * both genders (Kurta, Salwar) — the member has to say.
 */
export function inferGenderForCategory(category: string): Gender | null {
  const women = CategoriesByGender.Women.includes(category);
  const men = CategoriesByGender.Men.includes(category);
  if (women && !men) return 'Women';
  if (men && !women) return 'Men';
  return null;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface MatchInput {
  category: string;
  colour: string;
  occasion?: string;
  fabricWeight?: FabricWeight;
}

export interface ScoredListing {
  id: string;
  score: number;
  save_count?: number;
  [key: string]: any;
}

export function getComplementaryCategories(baseCategory: string): string[] {
  return COMPLEMENTARY_CATEGORIES[baseCategory] ?? [];
}

export function isNeutralBaseColour(baseColour: string): boolean {
  return NEUTRAL_BASE_COLOURS.has(baseColour);
}

export function getCompatibleColours(baseColour: string): { primary: string[]; secondary: string[] } {
  if (NEUTRAL_BASE_COLOURS.has(baseColour)) {
    // Neutrals are compatible with everything — return all known colours as secondary
    const all = Object.keys(COLOUR_MAP).filter(c => c !== baseColour);
    return { primary: [], secondary: all };
  }
  const entry = COLOUR_MAP[baseColour];
  if (!entry) return { primary: [], secondary: [] };

  // Neutral candidates go with every base colour. Keep any that the map
  // already ranks as primary at that tier; add the rest as secondary.
  const primary = [...entry.primary];
  const secondary = [...entry.secondary];
  for (const neutral of NEUTRAL_CANDIDATE_COLOURS) {
    if (!primary.includes(neutral) && !secondary.includes(neutral)) secondary.push(neutral);
  }
  return { primary, secondary };
}

/**
 * True when a candidate's colour sits inside the base colour's compatible set.
 * A neutral base accepts anything. An unset or 'Other' candidate colour is
 * unknown, so it is never a strict match against a non-neutral base.
 */
export function isColourCompatible(baseColour: string, candidateColour?: string | null): boolean {
  if (NEUTRAL_BASE_COLOURS.has(baseColour)) return true;
  if (!candidateColour || candidateColour === 'Other') return false;
  const compat = getCompatibleColours(baseColour);
  return compat.primary.includes(candidateColour) || compat.secondary.includes(candidateColour);
}

export function scoreMatch(base: MatchInput, candidate: {
  category: string;
  colour?: string | null;
  occasion?: string | null;
  fabricWeight?: FabricWeight | null;
  save_count?: number;
}): number {
  let score = 0;

  // Occasion match — strongest signal
  if (base.occasion && candidate.occasion && base.occasion === candidate.occasion) {
    score += 3;
  }

  // Colour compatibility
  if (base.colour && candidate.colour) {
    const compat = getCompatibleColours(base.colour);
    if (compat.primary.includes(candidate.colour)) score += 2;
    else if (compat.secondary.includes(candidate.colour)) score += 1;
  }

  // Fabric weight compatibility
  if (base.fabricWeight && candidate.fabricWeight) {
    const compatWeights = FABRIC_WEIGHT_COMPAT[base.fabricWeight] ?? [];
    if (compatWeights.includes(candidate.fabricWeight)) score += 1;
  }

  // Popularity signal — well-saved listings get a small boost
  if ((candidate.save_count ?? 0) >= 5) score += 1;

  return score;
}
