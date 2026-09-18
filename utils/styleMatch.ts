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
 * - Set completion: what a full set of each category is made of, so the engine's
 *   read of which pieces are in the photo turns into "what's missing"
 * - Accent colours: the engine's secondary colours count as matches too
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

// ─── Set completion ──────────────────────────────────────────────────────────

/** The separate pieces the engine can report seeing. Mirrors _shared/claudeRecognition.ts PIECES. */
export const PIECES = ['saree', 'skirt', 'top', 'bottoms', 'dupatta', 'blouse', 'jacket'] as const;
export type Piece = typeof PIECES[number];

/**
 * What a complete set of each category is made of, in the order a missing
 * piece should be suggested. Single-piece categories have no set.
 */
const SET_PIECES: Record<string, Piece[]> = {
  Lehenga:         ['skirt', 'blouse', 'dupatta'],
  Saree:           ['saree', 'blouse'],
  Anarkali:        ['top', 'bottoms', 'dupatta'],
  'Salwar Kameez': ['top', 'bottoms', 'dupatta'],
  Sharara:         ['top', 'bottoms', 'dupatta'],
  Sherwani:        ['top', 'bottoms'],
  'Kurta Pajama':  ['top', 'bottoms'],
  Achkan:          ['top', 'bottoms'],
  'Pathani Suit':  ['top', 'bottoms'],
};

/** Kurta is the one category whose set depends on who wears it. */
function setPiecesFor(category: string, gender: string | null | undefined): Piece[] | null {
  if (category === 'Kurta') return gender === 'Men' ? ['top', 'bottoms', 'jacket'] : ['top', 'bottoms', 'dupatta'];
  return SET_PIECES[category] ?? null;
}

/** The category to search when a piece is missing. */
const PIECE_TO_CATEGORY: Record<Piece, string> = {
  saree:   'Saree',
  skirt:   'Lehenga',
  top:     'Kurta',
  bottoms: 'Salwar',
  dupatta: 'Dupatta',
  blouse:  'Blouse',
  jacket:  'Nehru Jacket',
};

/** Categories that finish any outfit and are always worth showing after the missing pieces. */
const OUTFIT_EXTRAS = ['Jewellery', 'Accessories'];

/**
 * Which pieces of the base category's set are not in the photo. Null when
 * the category has no set, or when the engine reported no pieces (an older
 * build, or a photo it couldn't read), so callers fall back to the table.
 */
export function getMissingPieces(category: string, gender: string | null | undefined, pieces?: string[] | null): Piece[] | null {
  const set = setPiecesFor(category, gender);
  if (!set || !pieces || pieces.length === 0) return null;
  const seen = new Set(pieces);
  // The piece that *is* the category is never "missing" — a photo of a saree
  // drape reported only as 'top' would otherwise ask for a saree.
  return set.filter(p => !seen.has(p) && p !== set[0]);
}

export interface SuggestionPlan {
  /** Categories to search, in priority order. */
  categories: string[];
  /** The subset that completes the set — ranked ahead of everything else. */
  priority: string[];
  /** The missing pieces the plan is built on, if any. */
  missing: Piece[];
  /** Whether the plan came from what the engine saw or from the fixed table. */
  source: 'set' | 'table';
}

/**
 * What to search for. With the engine's read of the photo, that is the
 * missing pieces first and outfit extras after; with nothing missing, the
 * extras alone; without a read, the fixed complementary table.
 */
export function getSuggestionPlan(input: { category: string; gender?: string | null; pieces?: string[] | null }): SuggestionPlan {
  const missing = getMissingPieces(input.category, input.gender, input.pieces);
  if (missing === null) {
    return { categories: getComplementaryCategories(input.category), priority: [], missing: [], source: 'table' };
  }
  const priority = [...new Set(missing.map(p => PIECE_TO_CATEGORY[p]))];
  const categories = [...new Set([...priority, ...OUTFIT_EXTRAS])];
  return { categories, priority, missing, source: 'set' };
}

// ─── Engine attributes ───────────────────────────────────────────────────────

export interface FitAttributes {
  accentColours: string[];
  embellishment: 'none' | 'light' | 'heavy' | null;
  pieces: Piece[];
}

/** Parses the attributes the engine returned (as JSON on the route), keeping only known values. */
export function parseFitAttributes(raw: unknown): FitAttributes {
  const empty: FitAttributes = { accentColours: [], embellishment: null, pieces: [] };
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw) return empty;
    try { obj = JSON.parse(raw); } catch { return empty; }
  }
  if (!obj || typeof obj !== 'object') return empty;
  const a = obj as Record<string, unknown>;
  const known = new Set<string>(Object.keys(COLOUR_MAP));
  return {
    accentColours: Array.isArray(a.accentColours) ? a.accentColours.filter((c): c is string => typeof c === 'string' && known.has(c)).slice(0, 2) : [],
    embellishment: a.embellishment === 'none' || a.embellishment === 'light' || a.embellishment === 'heavy' ? a.embellishment : null,
    pieces: Array.isArray(a.pieces) ? a.pieces.filter((x): x is Piece => typeof x === 'string' && (PIECES as readonly string[]).includes(x)) : [],
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface MatchInput {
  category: string;
  colour: string;
  /** Secondary colours on the base piece (zari, borders). A candidate in one of these is as good as a primary match. */
  accentColours?: string[];
  occasion?: string;
  fabricWeight?: FabricWeight;
  /** Categories that complete the set; a candidate in one ranks ahead. */
  priorityCategories?: string[];
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

/**
 * Every colour that counts as a match for a base piece: the base colour's
 * compatible set plus the piece's own accent colours. Empty means no filter.
 */
export function getStrictColours(baseColour: string, accentColours: string[] = []): string[] {
  if (NEUTRAL_BASE_COLOURS.has(baseColour)) return [];
  const compat = getCompatibleColours(baseColour);
  return [...new Set([...compat.primary, ...compat.secondary, ...accentColours.filter(c => c !== 'Other')])];
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
export function isColourCompatible(baseColour: string, candidateColour?: string | null, accentColours: string[] = []): boolean {
  if (NEUTRAL_BASE_COLOURS.has(baseColour)) return true;
  if (!candidateColour || candidateColour === 'Other') return false;
  if (accentColours.includes(candidateColour)) return true;
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

  // Completing the set — the piece the photo is missing ranks first
  if (base.priorityCategories?.includes(candidate.category)) score += 2;

  // Colour compatibility — an accent colour on the base piece counts like a primary match
  if (base.colour && candidate.colour) {
    const compat = getCompatibleColours(base.colour);
    if (base.accentColours?.includes(candidate.colour)) score += 2;
    else if (compat.primary.includes(candidate.colour)) score += 2;
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
