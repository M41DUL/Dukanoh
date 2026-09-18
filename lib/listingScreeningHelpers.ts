/**
 * Pure parts of the sell form's one-look-per-batch screening: shapes,
 * normalisers and the batch merge. No Supabase import, so Jest can load it.
 */
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

export interface ListingScreen {
  photos: PhotoScreen[];
  cover: ListingCoverRead | null;
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

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Stitches batch responses back into one result in the original order. A
 * null batch (failed or timed out) passes its photos through. The cover read
 * comes from the first batch only, since that's where photo 1 is.
 */
export function mergeBatches(batches: (unknown | null)[], sizes: number[]): ListingScreen {
  const photos: PhotoScreen[] = [];
  let cover: ListingCoverRead | null = null;
  batches.forEach((batch, b) => {
    const size = sizes[b];
    const data = (batch && typeof batch === 'object' ? batch : null) as Record<string, unknown> | null;
    const entries = data && Array.isArray(data.photos) ? data.photos : null;
    for (let i = 0; i < size; i++) {
      photos.push(entries && entries[i] ? normalisePhotoScreen(entries[i]) : passThroughPhoto());
    }
    if (b === 0 && data) cover = normaliseCoverRead(data.cover);
  });
  return { photos, cover };
}

