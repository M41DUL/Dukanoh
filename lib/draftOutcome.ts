/**
 * Scores what a seller did with a drafted field. Pure, so it can be unit
 * tested; the row is written by recordDraftOutcome in lib/listingScreening.
 *
 *   none      — nothing was drafted for this field
 *   kept      — published exactly as drafted
 *   edited    — changed, but most of the words are still the draft's
 *   replaced  — rewritten
 *   cleared   — the draft was removed and nothing put in its place
 */
import type { ListingDraft } from '@/lib/listingScreeningHelpers';

export type DraftOutcome = 'none' | 'kept' | 'edited' | 'replaced' | 'cleared';

export interface DraftedFields {
  title: string;
  description: string;
  fabric: string;
  occasion: string;
}

export interface DraftOutcomes {
  title: DraftOutcome;
  description: DraftOutcome;
  fabric: DraftOutcome;
  occasion: DraftOutcome;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

/** Share of the draft's words that survive in the final text, 0 to 1. */
export function wordOverlap(draft: string, final: string): number {
  const a = words(draft);
  if (a.size === 0) return 0;
  const b = words(final);
  let kept = 0;
  for (const w of a) if (b.has(w)) kept += 1;
  return kept / a.size;
}

export function draftOutcome(draft: string | null | undefined, final: string): DraftOutcome {
  if (!draft) return 'none';
  const d = draft.trim();
  const f = final.trim();
  if (!f) return 'cleared';
  if (d === f) return 'kept';
  return wordOverlap(d, f) >= 0.5 ? 'edited' : 'replaced';
}

export function draftOutcomes(draft: ListingDraft | null, form: DraftedFields): DraftOutcomes {
  return {
    title: draftOutcome(draft?.title, form.title),
    description: draftOutcome(draft?.description, form.description),
    fabric: draftOutcome(draft?.fabric, form.fabric),
    occasion: draftOutcome(draft?.occasion, form.occasion),
  };
}

export function anyDraftOffered(o: DraftOutcomes): boolean {
  return Object.values(o).some(v => v !== 'none');
}
