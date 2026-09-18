/**
 * Dukanoh Fit — the one-line read of a piece.
 *
 * Turns what the engine saw into the sentence on the confirmation card:
 * "Maroon anarkali with gold" / "Heavy embroidery · For women" /
 * "Missing a dupatta — we'll look for one first." Pure, so it's unit tested.
 */
import type { Piece } from '@/utils/styleMatch';

/** Category names as they read mid-sentence. Proper nouns keep their capital. */
const CATEGORY_IN_SENTENCE: Record<string, string> = {
  'Nehru Jacket': 'Nehru jacket',
  'Pathani Suit': 'Pathani suit',
};

export function categoryInSentence(category: string): string {
  return CATEGORY_IN_SENTENCE[category] ?? category.toLowerCase();
}

const PIECE_IN_SENTENCE: Record<Piece, string> = {
  saree:   'a saree',
  skirt:   'a lehenga skirt',
  top:     'a top',
  bottoms: 'bottoms',
  dupatta: 'a dupatta',
  blouse:  'a blouse',
  jacket:  'a jacket',
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface FitSummaryInput {
  category: string;
  colour: string;
  gender?: string | null;
  accentColours?: string[];
  embellishment?: 'none' | 'light' | 'heavy' | null;
  missing?: Piece[] | null;
}

export interface FitSummary {
  /** "Maroon anarkali with gold" */
  headline: string;
  /** "Heavy embroidery · For women", or empty */
  detail: string;
  /** "Missing a dupatta — we'll look for one first.", or null when nothing is missing or unknown */
  missingLine: string | null;
}

export function buildFitSummary(input: FitSummaryInput): FitSummary {
  const name = categoryInSentence(input.category);
  const colour = input.colour.toLowerCase();
  const accents = (input.accentColours ?? []).filter(c => c !== 'Other').map(c => c.toLowerCase());
  let headline = colour === 'multi' ? `Multicoloured ${name}` : colour === 'other' ? capitalise(name) : `${capitalise(colour)} ${name}`;
  if (accents.length > 0) headline += ` with ${joinList(accents)}`;

  const details: string[] = [];
  if (input.embellishment === 'heavy') details.push('Heavy embroidery');
  else if (input.embellishment === 'light') details.push('Light embroidery');
  if (input.gender === 'Men') details.push('For men');
  else if (input.gender === 'Women') details.push('For women');

  const missing = input.missing ?? [];
  const missingLine = missing.length === 0
    ? null
    : missing.length === 1
      ? `Missing ${PIECE_IN_SENTENCE[missing[0]]} — we'll look for one first.`
      : `Missing ${joinList(missing.map(p => PIECE_IN_SENTENCE[p]))} — we'll look for those first.`;

  return { headline, detail: details.join(' · '), missingLine };
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The line above the results grid when the search led with a missing piece. */
export function missingSearchNote(missing: Piece[] | null | undefined): string | null {
  if (!missing || missing.length === 0) return null;
  const names = missing.map(p => PIECE_IN_SENTENCE[p]);
  return `Looking for ${joinList(names)} first.`;
}
