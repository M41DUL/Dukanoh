/**
 * Dukanoh Fit — style matching utility
 *
 * Provides:
 * - Complementary category map (base piece → what to suggest)
 * - Colour compatibility map (primary +2, secondary +1 scores); neutrals pair
 *   with every base colour
 * - Fabric → weight mapping and weight compatibility (there is no
 *   fabric_weight column — `listings.fabric` is the only source)
 * - Gender inference from the base category (Kurta / Salwar are ambiguous)
 * - scoreMatch() — scores a candidate listing against a base piece
 */

import { CategoriesByGender, type Gender } from '@/constants/theme';

// ─── Complementary category map ─────────────────────────────────────────────

export const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  Lehenga:        ['Dupatta', 'Blouse'],
  Saree:          ['Blouse', 'Dupatta'],
  Anarkali:       ['Dupatta', 'Salwar', 'Sharara'],
  Kurta:          ['Dupatta', 'Salwar', 'Sharara', 'Nehru Jacket'],
  Sherwani:       ['Kurta', 'Salwar'],
  Achkan:         ['Kurta', 'Salwar'],
  'Pathani Suit': ['Salwar'],
  Dupatta:        ['Lehenga', 'Anarkali', 'Kurta', 'Saree'],
  Blouse:         ['Saree', 'Lehenga'],
  Sharara:        ['Kurta', 'Anarkali'],
  Salwar:         ['Kurta', 'Achkan', 'Sherwani', 'Pathani Suit'],
  'Nehru Jacket': ['Kurta'],
};

// ─── Colour compatibility map ────────────────────────────────────────────────

interface ColourCompatibility {
  primary: string[];   // +2 score
  secondary: string[]; // +1 score
}

export const COLOUR_MAP: Record<string, ColourCompatibility> = {
  Red:    { primary: ['Gold', 'Maroon'],              secondary: ['Beige', 'Pink', 'Black'] },
  Maroon: { primary: ['Gold', 'Pink'],                secondary: ['Beige', 'White', 'Red'] },
  Pink:   { primary: ['Gold', 'Beige'],               secondary: ['White', 'Red', 'Multi'] },
  Green:  { primary: ['Gold', 'Beige'],               secondary: ['Multi', 'White'] },
  Blue:   { primary: ['Gold', 'Beige'],               secondary: ['White', 'Multi'] },
  Gold:   { primary: ['Red', 'Maroon', 'Green'],      secondary: ['Blue', 'Pink', 'Beige'] },
  Black:  { primary: ['Gold', 'White'],               secondary: ['Beige', 'Multi'] },
  Beige:  { primary: [],                              secondary: [] }, // neutral — matches everything
  White:  { primary: [],                              secondary: [] }, // neutral — matches everything
  Multi:  { primary: ['Beige', 'White', 'Black'],     secondary: ['Gold'] },
  Other:  { primary: [],                              secondary: [] }, // unknown — no filter applied
};

/** Base colours that pair with everything — no colour filter is applied. */
const NEUTRAL_BASE_COLOURS = new Set(['Beige', 'White', 'Other']);

/** Candidate colours that pair with every non-neutral base (secondary tier). */
const NEUTRAL_CANDIDATE_COLOURS = ['Beige', 'White'];

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
  Silk:      'Structured',
  Cotton:    'Structured',
  Linen:     'Structured',
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
