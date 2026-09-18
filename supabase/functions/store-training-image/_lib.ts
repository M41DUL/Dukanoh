// Pure logic for store-training-image — no Deno or AWS dependencies, so it
// can be unit tested. The lists mirror constants/theme.ts; a test asserts
// they match so a taxonomy change can't silently start rejecting uploads.

export const VALID_CATEGORIES = new Set([
  'Lehenga', 'Saree', 'Anarkali', 'Salwar Kameez', 'Kurta', 'Sharara', 'Gown',
  'Dupatta', 'Blouse', 'Salwar',
  'Sherwani', 'Kurta Pajama', 'Achkan', 'Pathani Suit', 'Nehru Jacket',
  'Jewellery', 'Accessories', 'Casualwear', 'Shoes',
]);

export const VALID_COLOURS = new Set([
  'Black', 'White', 'Cream', 'Grey', 'Silver',
  'Red', 'Maroon', 'Pink', 'Peach', 'Orange', 'Yellow', 'Gold',
  'Green', 'Teal', 'Blue', 'Navy', 'Purple',
  'Multi', 'Other',
]);

export const VALID_OCCASIONS = new Set(['Everyday', 'Eid', 'Diwali', 'Festive', 'Wedding', 'Mehndi', 'Party', 'Formal']);
export const VALID_GENDERS = new Set(['Men', 'Women']);
export const VALID_FABRIC_WEIGHTS = new Set(['Light', 'Structured', 'Heavy']);

/** Bump when the lists above change shape, so rows can be filtered by era. */
export const TAXONOMY_VERSION = 2;

export const MAX_BASE64_LENGTH = 2_500_000;

export type Rejection = 'no_image' | 'too_large' | 'bad_category' | 'person';

/** What the Fit form sends after a search — everything except the image is optional. */
export interface TrainingSubmission {
  imageBase64?: unknown;
  category?: unknown;
  gender?: unknown;
  colour?: unknown;
  occasion?: unknown;
  fabricWeight?: unknown;
  hasPerson?: unknown;
  predicted?: unknown;
}

/** The garment_labels columns a Fit submission fills in. */
export interface LabelRow {
  source: 'fit';
  category: string;
  gender: string | null;
  colour: string | null;
  occasion: string | null;
  fabric_weight: string | null;
  predicted_category: string | null;
  predicted_colour: string | null;
  predicted_confidence: number | null;
  predicted_engine: string | null;
  predicted_engine_version: string | null;
  taxonomy_version: number;
  has_person: boolean;
}

function pick(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Validates a submission. Unknown optional values become null rather than
 * failing the row — a wrong colour shouldn't cost the photo. A photo with a
 * person in it is rejected outright: it was used for the search and must not
 * be kept.
 */
export function validateSubmission(body: TrainingSubmission):
  | { ok: true; imageBase64: string; row: LabelRow }
  | { ok: false; reason: Rejection } {
  const raw = body.imageBase64;
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'no_image' };
  if (raw.length > MAX_BASE64_LENGTH) return { ok: false, reason: 'too_large' };
  if (body.hasPerson === true || body.hasPerson === 'true' || body.hasPerson === '1') {
    return { ok: false, reason: 'person' };
  }
  const category = pick(body.category, VALID_CATEGORIES);
  if (!category) return { ok: false, reason: 'bad_category' };

  const predicted = (body.predicted && typeof body.predicted === 'object' ? body.predicted : {}) as Record<string, unknown>;
  const confidence = typeof predicted.confidence === 'number' && predicted.confidence >= 0 && predicted.confidence <= 1
    ? predicted.confidence
    : null;

  return {
    ok: true,
    imageBase64: raw.includes(',') ? raw.split(',')[1] : raw,
    row: {
      source: 'fit',
      category,
      gender: pick(body.gender, VALID_GENDERS),
      colour: pick(body.colour, VALID_COLOURS),
      occasion: pick(body.occasion, VALID_OCCASIONS),
      fabric_weight: pick(body.fabricWeight, VALID_FABRIC_WEIGHTS),
      predicted_category: pick(predicted.category, VALID_CATEGORIES),
      predicted_colour: pick(predicted.colour, VALID_COLOURS),
      predicted_confidence: confidence,
      predicted_engine: str(predicted.engine),
      predicted_engine_version: str(predicted.engineVersion),
      taxonomy_version: TAXONOMY_VERSION,
      has_person: false,
    },
  };
}
