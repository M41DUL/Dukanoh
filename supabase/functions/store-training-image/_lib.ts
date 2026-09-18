// Pure logic for store-training-image — no Deno dependencies, so it can be
// unit tested. Lists come from the shared taxonomy, which a test pins to
// constants/theme.ts.

import { CATEGORIES, COLOURS, FABRIC_WEIGHTS, GENDERS, OCCASIONS, TAXONOMY_VERSION as SHARED_TAXONOMY_VERSION } from '../_shared/garmentTaxonomy.ts';
import { PIECES } from '../_shared/claudeRecognition.ts';

export const VALID_CATEGORIES = new Set(CATEGORIES);
export const VALID_COLOURS = new Set(COLOURS);
export const VALID_OCCASIONS = new Set(OCCASIONS);
export const VALID_GENDERS = new Set(GENDERS);
export const VALID_FABRIC_WEIGHTS = new Set(FABRIC_WEIGHTS);
export const TAXONOMY_VERSION = SHARED_TAXONOMY_VERSION;

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
  attributes?: unknown;
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
  predicted_model: string | null;
  attributes: { accentColours: string[]; embellishment: string | null; pieces: string[] } | null;
  taxonomy_version: number;
  has_person: boolean;
}

/** The engine's richer read, kept only if it is well-formed. */
function normaliseAttributes(value: unknown): LabelRow['attributes'] {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const accentColours = Array.isArray(a.accentColours)
    ? a.accentColours.filter((c): c is string => typeof c === 'string' && VALID_COLOURS.has(c)).slice(0, 2)
    : [];
  const embellishment = typeof a.embellishment === 'string' && ['none', 'light', 'heavy'].includes(a.embellishment)
    ? a.embellishment
    : null;
  const pieces = Array.isArray(a.pieces)
    ? [...new Set(a.pieces.filter((x): x is string => typeof x === 'string' && (PIECES as readonly string[]).includes(x)))]
    : [];
  if (accentColours.length === 0 && embellishment === null && pieces.length === 0) return null;
  return { accentColours, embellishment, pieces };
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
      predicted_model: str(predicted.model),
      attributes: normaliseAttributes(body.attributes),
      taxonomy_version: TAXONOMY_VERSION,
      has_person: false,
    },
  };
}
