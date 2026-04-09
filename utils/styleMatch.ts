/**
 * Dukanoh Fit — style matching utility
 *
 * Provides:
 * - Complementary category map (base piece → what to suggest)
 * - Colour compatibility map (primary +2, secondary +1 scores)
 * - Fabric weight compatibility map
 * - scoreMatch() — scores a candidate listing against a base piece
 */

// ─── Complementary category map ─────────────────────────────────────────────

export const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  Lehenga:        ['Dupatta', 'Blouse'],
  Saree:          ['Blouse', 'Dupatta'],
  Anarkali:       ['Dupatta'],
  Kurta:          ['Dupatta', 'Salwar', 'Sharara', 'Nehru Jacket'],
  Sherwani:       ['Salwar'],
  Achkan:         ['Salwar'],
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

const NEUTRAL_COLOURS = new Set(['Beige', 'White', 'Other']);

// ─── Fabric weight map ───────────────────────────────────────────────────────

type FabricWeight = 'Light' | 'Structured' | 'Heavy';

export const FABRIC_WEIGHT_COMPAT: Record<FabricWeight, FabricWeight[]> = {
  Light:      ['Light', 'Structured'],
  Structured: ['Light', 'Structured', 'Heavy'],
  Heavy:      ['Structured', 'Heavy'],
};

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

export function getCompatibleColours(baseColour: string): { primary: string[]; secondary: string[] } {
  if (NEUTRAL_COLOURS.has(baseColour)) {
    // Neutrals are compatible with everything — return all known colours as secondary
    const all = Object.keys(COLOUR_MAP).filter(c => c !== baseColour);
    return { primary: [], secondary: all };
  }
  return COLOUR_MAP[baseColour] ?? { primary: [], secondary: [] };
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

  return score;
}
