/**
 * Pure parts of the sell form's one-look-per-batch screening: shapes,
 * normalisers and the batch merge. No Supabase import, so Jest can load it.
 */
import { Fabrics, Occasions } from '@/constants/theme';

export const BATCH_SIZE = 4;
export interface PhotoScreen {
  blocked: boolean;
  reasons: string[];
  isClothing: boolean;
  warnings: string[];
  /** Neither blocked nor rejected as not clothing. */
  ok: boolean;
}

export interface ListingCoverRead {
  detectedCategory: string | null;
  detectedColour: string | null;
  detectedGender: string | null;
  confidence: number | null;
  attributes: unknown;
}

/**
 * What the engine drafted from the photos. The form fills each field the
 * seller has not typed in; the server has already taken the machine out of
 * the text (see _shared/claudeRecognition.ts, normaliseDraft).
 */
export interface ListingDraft {
  title: string | null;
  description: string | null;
  fabric: string | null;
  occasion: string | null;
  engineVersion: string | null;
}

export interface ListingScreen {
  photos: PhotoScreen[];
  cover: ListingCoverRead | null;
  draft: ListingDraft | null;
}

export function passThroughPhoto(): PhotoScreen {
  return { blocked: false, reasons: [], isClothing: true, warnings: [], ok: true };
}

export function normalisePhotoScreen(raw: unknown): PhotoScreen {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const blocked = r.blocked === true;
  const isClothing = r.isClothing !== false;
  return {
    blocked,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string') : [],
    isClothing,
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((x): x is string => typeof x === 'string') : [],
    ok: !blocked && isClothing,
  };
}

export function normaliseCoverRead(raw: unknown): ListingCoverRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    detectedCategory: str(r.detectedCategory),
    detectedColour: str(r.detectedColour),
    detectedGender: str(r.detectedGender),
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    attributes: r.attributes ?? null,
  };
}

/** Only values the form could hold: non-empty text within its limits, fabric and occasion from the theme lists. */
export function normaliseDraft(raw: unknown): ListingDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const listed = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : null);
  const draft: ListingDraft = {
    title: text(r.title, 80),
    description: text(r.description, 500),
    fabric: listed(r.fabric, Fabrics),
    occasion: listed(r.occasion, Occasions),
    engineVersion: text(r.engineVersion, 64),
  };
  return draft.title || draft.description || draft.fabric || draft.occasion ? draft : null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Stitches batch responses back into one result in the original order. A
 * null batch (failed or timed out) passes its photos through. The cover read
 * and the draft come from the first batch only, since that's where photo 1 is.
 */
export function mergeBatches(batches: (unknown | null)[], sizes: number[]): ListingScreen {
  const photos: PhotoScreen[] = [];
  let cover: ListingCoverRead | null = null;
  let draft: ListingDraft | null = null;
  batches.forEach((batch, b) => {
    const size = sizes[b];
    const data = (batch && typeof batch === 'object' ? batch : null) as Record<string, unknown> | null;
    const entries = data && Array.isArray(data.photos) ? data.photos : null;
    for (let i = 0; i < size; i++) {
      photos.push(entries && entries[i] ? normalisePhotoScreen(entries[i]) : passThroughPhoto());
    }
    if (b === 0 && data) {
      cover = normaliseCoverRead(data.cover);
      draft = normaliseDraft(data.draft);
    }
  });
  return { photos, cover, draft };
}

