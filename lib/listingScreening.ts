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
import { BATCH_SIZE, chunk, mergeBatches, type ListingScreen } from '@/lib/listingScreeningHelpers';

export type { ListingCoverRead, ListingScreen, PhotoScreen } from '@/lib/listingScreeningHelpers';

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
  if (uris.length === 0) return { photos: [], cover: null };
  const groups = chunk(uris, BATCH_SIZE);
  const results = await Promise.all(groups.map(screenBatch));
  return mergeBatches(results, groups.map(g => g.length));
}
