/**
 * One look per listing. The sell form used to make two or three calls per
 * photo (screening, clothing check, cover quality). Now every photo goes to
 * analyse-listing-image in one request per batch, which screens each one and
 * reads the piece from the cover.
 *
 * Fails open: if a batch can't be checked, its photos pass and nothing is
 * pre-filled. A seller is never blocked because a service was down.
 */
import { supabase } from '@/lib/supabase';
import { compressImageForAnalysis } from '@/lib/imageUtils';
import { BATCH_SIZE, chunk, mergeBatches, type ListingDraft, type ListingScreen } from '@/lib/listingScreeningHelpers';
import { anyDraftOffered, draftOutcomes, type DraftedFields } from '@/lib/draftOutcome';

export type { ListingCoverRead, ListingDraft, ListingScreen, PhotoScreen } from '@/lib/listingScreeningHelpers';

const TIMEOUT_MS = 25_000;

async function screenBatch(uris: string[]): Promise<unknown | null> {
  try {
    const imagesBase64 = await Promise.all(uris.map(compressImageForAnalysis));
    const invoke = supabase.functions.invoke('analyse-listing-image', {
      body: { check: 'listing', imagesBase64 },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
    );
    const { data, error } = await Promise.race([invoke, timeout]);
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function screenListingPhotos(uris: string[]): Promise<ListingScreen> {
  if (uris.length === 0) return { photos: [], cover: null, draft: null };
  const groups = chunk(uris, BATCH_SIZE);
  const results = await Promise.all(groups.map(screenBatch));
  return mergeBatches(results, groups.map(g => g.length));
}

/**
 * Records what the seller did with each drafted field at publish: kept,
 * edited, replaced or cleared. No listing text leaves the device, only the
 * outcome, so the drafts can be scored by engine version and tier. Fire and
 * forget: a failure here never touches the publish.
 */
export function recordDraftOutcome(args: {
  listingId: string;
  userId: string;
  sellerTier: 'free' | 'pro' | 'founder';
  draft: ListingDraft | null;
  form: DraftedFields;
}): void {
  const outcomes = draftOutcomes(args.draft, args.form);
  if (!anyDraftOffered(outcomes)) return;
  supabase
    .from('listing_draft_outcomes')
    .insert({
      listing_id: args.listingId,
      user_id: args.userId,
      seller_tier: args.sellerTier,
      title_outcome: outcomes.title,
      description_outcome: outcomes.description,
      fabric_outcome: outcomes.fabric,
      occasion_outcome: outcomes.occasion,
      engine_version: args.draft?.engineVersion ?? null,
    })
    .then(() => {}, () => {});
}
