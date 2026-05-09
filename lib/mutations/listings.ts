// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/components/ListingCard';
import { compressImage, extractStoragePath } from '../imageUtils';
import { buildMeasurements, type ListingForm } from '../sellHelpers';
import { supabase } from '../supabase';
import { queryKeys } from '../queryKeys';

// ─── Listings ─────────────────────────────────────────────────

interface CreateListingArgs {
  userId: string;
  form: ListingForm;
  measurementsNote: string;
  images: string[];
  newStatus: 'available' | 'draft';
  // Per-image upload progress so the sell screen can render the
  // "Uploading photos… 2/8" text. Called once with (0, total) up-front
  // and once per successful upload with the running done count.
  onUploadProgress?: (done: number, total: number) => void;
}

// Compress + upload one local image URI; returns { path, publicUrl } so
// callers can both store the URL on the row and remove the blob if a later
// step (e.g. the row insert) fails. Throws on upload failure.
async function uploadOneListingImage(uri: string, userId: string): Promise<{ path: string; publicUrl: string }> {
  const compressed = await compressImage(uri);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const response = await fetch(compressed);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from('listings')
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
  if (error) throw new Error(`Failed to upload photo: ${error.message}`);
  const { data } = supabase.storage.from('listings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

// Best-effort cleanup of orphaned uploads. Used when a later step in a multi-
// step flow fails — we don't want to leave dead blobs in the bucket. Errors
// are swallowed: by the time we're here the user is already getting a failure
// alert, and a failed cleanup on top of that helps no one.
async function removeListingBlobs(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from('listings').remove(paths);
  } catch {
    // Swallow — see comment above.
  }
}

/**
 * Creates a new listing: uploads images concurrently to the `listings` storage
 * bucket, then inserts the row with status set to either 'available' (publish)
 * or 'draft' (save for later). Returns the new listing's id along with the
 * uploaded public image URLs so the caller can render the success view
 * without re-fetching.
 *
 * If any upload fails (so Promise.all rejects with some siblings already
 * landed) or the row insert fails after all uploads succeeded, we best-effort
 * remove the uploaded blobs so the bucket doesn't accumulate orphans.
 *
 * Invalidates myListings.all (Selling/Drafts tabs), listings.all (browse,
 * search, detail caches), and home.all (Suggested / New arrivals) so the new
 * listing surfaces everywhere it should without a manual refresh.
 */
export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      form,
      measurementsNote,
      images,
      newStatus,
      onUploadProgress,
    }: CreateListingArgs): Promise<{ id: string; images: string[] }> => {
      onUploadProgress?.(0, images.length);
      // Collect succeeded paths as they land so we can clean up if a sibling
      // upload — or the row insert below — fails.
      const succeeded: string[] = [];
      let completed = 0;
      let uploaded: { path: string; publicUrl: string }[];
      try {
        uploaded = await Promise.all(
          images.map(async uri => {
            const result = await uploadOneListingImage(uri, userId);
            succeeded.push(result.path);
            completed += 1;
            onUploadProgress?.(completed, images.length);
            return result;
          }),
        );
      } catch (err) {
        await removeListingBlobs(succeeded);
        throw err;
      }
      const imageUrls = uploaded.map(u => u.publicUrl);

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: userId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          price: parseFloat(form.price),
          gender: form.gender,
          category: form.category,
          condition: form.condition,
          size: form.size || null,
          occasion: form.occasion || null,
          colour: form.colour || null,
          fabric: form.fabric || null,
          measurements: buildMeasurements(measurementsNote),
          worn_at: form.worn_at.trim() || null,
          images: imageUrls,
          status: newStatus,
          published_at: newStatus === 'available' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();
      if (error) {
        await removeListingBlobs(succeeded);
        throw error;
      }
      return { id: data.id as string, images: imageUrls };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface DeleteListingArgs {
  listingId: string;
  status: Listing['status'];
  images: string[] | null | undefined;
}

// Sentinel error so callers can show a specific alert instead of a generic one
// when a published listing still has an in-flight order.
export class ActiveOrderExistsError extends Error {
  constructor() {
    super('Listing has an active order in progress');
    this.name = 'ActiveOrderExistsError';
  }
}

/**
 * Deletes a listing: checks for active orders (only for published listings),
 * removes storage files, then deletes the row. Invalidates `myListings.all`
 * and `listings.all` on success so the My items lists and any cached detail
 * view refetch.
 */
export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, status, images }: DeleteListingArgs) => {
      if (status === 'available') {
        const { count, error: countError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', listingId)
          .not('status', 'in', '(cancelled,completed,resolved)');
        if (countError) throw countError;
        if (count && count > 0) throw new ActiveOrderExistsError();
      }
      const storagePaths = (images ?? [])
        .map(url => extractStoragePath(url, 'listings'))
        .filter((p): p is string => p !== null);
      if (storagePaths.length > 0) {
        // Best-effort: a storage failure shouldn't block the row delete (the
        // user already confirmed and is waiting on a response). The codebase
        // has a `no-console` rule, so the error is intentionally not logged
        // — orphans are accepted as the failure mode here.
        await supabase.storage.from('listings').remove(storagePaths);
      }
      const { error } = await supabase.from('listings').delete().eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      // Deletion can drop a row from Suggested / New arrivals on home.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface UpdateListingPatch {
  title: string;
  description: string | null;
  price: number;
  gender: string | undefined;
  category: string;
  condition: string;
  size: string | null;
  occasion: string | null;
  colour: string | null;
  fabric: string | null;
  measurements: { note: string } | null;
  worn_at: string | null;
}

interface UpdateListingArgs {
  listingId: string;
  userId: string;
  patch: UpdateListingPatch;
  // The final ordered list of image URIs the user wants on the listing.
  // Mix of existing `https://…/storage/v1/object/public/listings/…` URLs
  // (carry through unchanged) and local `file://` URIs from the picker
  // (uploaded fresh).
  images: string[];
  // The listing's previously-saved image URLs, used to compute which storage
  // blobs to remove after a successful update — anything in `previousImages`
  // that isn't in the final URL list is dropped from the bucket.
  previousImages: string[];
  newStatus: 'draft' | 'available';
}

// Compress + upload any local image URIs in `images` in parallel; pass through
// existing http(s) URLs unchanged. Returns the final ordered list of public
// URLs along with the storage paths of the newly-uploaded blobs (so callers
// can clean them up if a later step fails). Preserves caller-supplied order.
async function uploadListingImages(
  images: string[],
  userId: string,
): Promise<{ urls: string[]; uploadedPaths: string[] }> {
  const uploadedPaths: string[] = [];
  const slots: (string | null)[] = images.map(uri => (uri.startsWith('http') ? uri : null));
  const localIndexes = images
    .map((uri, i) => (uri.startsWith('http') ? -1 : i))
    .filter(i => i !== -1);

  try {
    await Promise.all(
      localIndexes.map(async i => {
        const result = await uploadOneListingImage(images[i], userId);
        uploadedPaths.push(result.path);
        slots[i] = result.publicUrl;
      }),
    );
  } catch (err) {
    await removeListingBlobs(uploadedPaths);
    throw err;
  }

  return { urls: slots as string[], uploadedPaths };
}

/**
 * Saves an edited listing: uploads any newly-added local images in parallel,
 * writes the patch + status (and bumps `published_at` when publishing), then
 * removes any storage blobs the seller dropped from the photo list so the
 * bucket doesn't accumulate orphans.
 *
 * If the row update fails after uploads succeeded, the new uploads are best-
 * effort removed so a retry doesn't multiply orphans. The post-update cleanup
 * of dropped photos is also best-effort — its failure doesn't roll the row
 * change back, since by that point the listing is already saved.
 *
 * Invalidates `listings.all`, `myListings.all`, and `home.all` on success.
 */
export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      userId,
      patch,
      images,
      previousImages,
      newStatus,
    }: UpdateListingArgs) => {
      const { urls: imageUrls, uploadedPaths } = await uploadListingImages(images, userId);

      const { error } = await supabase
        .from('listings')
        .update({
          ...patch,
          images: imageUrls,
          status: newStatus,
          ...(newStatus === 'available' ? { published_at: new Date().toISOString() } : {}),
        })
        .eq('id', listingId);
      if (error) {
        await removeListingBlobs(uploadedPaths);
        throw error;
      }

      // Remove blobs for images the seller dropped from the photo list. Diff
      // is on the final ordered URL list; anything in previousImages not in
      // imageUrls is no longer referenced by this listing.
      const finalUrlSet = new Set(imageUrls);
      const droppedPaths = previousImages
        .filter(url => !finalUrlSet.has(url))
        .map(url => extractStoragePath(url, 'listings'))
        .filter((p): p is string => p !== null);
      await removeListingBlobs(droppedPaths);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      // Edits / publishing affect Suggested / New arrivals on home.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

type UpdateListingStatusArgs =
  | { listingId: string; status: 'sold' }
  | { listingId: string; status: 'available' };

/**
 * Status-only flip from the listing detail screen (seller-side).
 *   draft     → available  ("Publish")
 *   available → sold        ("Mark as sold")
 * The sold branch also stamps `sold_at`.
 *
 * Kept separate from useUpdateListing because that hook requires a heavy
 * patch (title, description, price, etc.) and runs an image-upload step.
 *
 * Invalidates listings.all (browse / search / detail caches), myListings.all
 * (the seller's Selling and Drafts tabs), and home.all (Suggested / New
 * arrivals).
 */
export function useUpdateListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: UpdateListingStatusArgs) => {
      const patch = args.status === 'sold'
        ? { status: 'sold', sold_at: new Date().toISOString() }
        : { status: 'available' };
      const { error } = await supabase
        .from('listings')
        .update(patch)
        .eq('id', args.listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface DuplicateListingArgs {
  sellerId: string;
  source: {
    title: string;
    description: string | null;
    price: number;
    category: string;
    condition: string;
    size: string | null;
    occasion: string | null;
    measurements: { note?: string; chest?: string; waist?: string; length?: string } | null;
    images: string[] | null;
    worn_at: string | null;
  };
}

// Copy each source image to a fresh path under the new seller's folder so the
// duplicate doesn't share storage objects with the source. If the source ever
// gets deleted, useDeleteListing.remove(...) won't take the duplicate's images
// down with it. Non-Supabase URLs (shouldn't happen for our listings, but be
// safe) pass through unchanged.
async function copyListingImages(sourceUrls: string[], sellerId: string): Promise<string[]> {
  const result: string[] = [];
  for (const url of sourceUrls) {
    const srcPath = extractStoragePath(url, 'listings');
    if (!srcPath) {
      result.push(url);
      continue;
    }
    const destPath = `${sellerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage.from('listings').copy(srcPath, destPath);
    if (error) throw new Error(`Failed to copy photo: ${error.message}`);
    const { data } = supabase.storage.from('listings').getPublicUrl(destPath);
    result.push(data.publicUrl);
  }
  return result;
}

/**
 * Inserts a new draft listing seeded from the source listing's fields.
 * Returns the new listing id so the caller can navigate to its edit screen.
 * Source images are copied to fresh storage paths so the duplicate is
 * independent — deleting the source listing won't 404 the duplicate's photos.
 * Invalidates myListings.all so the new draft appears in the Drafts tab.
 */
export function useDuplicateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sellerId, source }: DuplicateListingArgs): Promise<string> => {
      const copiedImages = source.images?.length
        ? await copyListingImages(source.images, sellerId)
        : source.images;

      const { data, error } = await supabase
        .from('listings')
        .insert({
          seller_id: sellerId,
          title: source.title,
          description: source.description,
          price: source.price,
          category: source.category,
          condition: source.condition,
          size: source.size,
          occasion: source.occasion,
          measurements: source.measurements,
          images: copiedImages,
          worn_at: source.worn_at,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Could not duplicate listing.');
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
    },
  });
}

interface ReportListingArgs {
  reporterId: string;
  listingId: string;
  sellerId: string;
  reason: string;
}

/**
 * Inserts a row into `reports`. No invalidation — the reports table isn't
 * surfaced anywhere in the user-facing app, so no cached query depends on it.
 */
export function useReportListing() {
  return useMutation({
    mutationFn: async ({ reporterId, listingId, sellerId, reason }: ReportListingArgs) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        listing_id: listingId,
        seller_id: sellerId,
        reason,
      });
      if (error) throw error;
    },
  });
}

interface RecordListingViewArgs {
  listingId: string;
  userId: string;
}

/**
 * Records that a logged-in user viewed a listing. Drives the Recently viewed
 * row on home (queryKeys.home.recentlyViewed). Backed by an upsert on
 * (listing_id, user_id) so repeat views just bump `viewed_at`.
 *
 * Analytics is non-fatal — errors are logged, not thrown, so a failed write
 * never breaks the screen the user is actually trying to read.
 *
 * Invalidation is scoped to `home.recentlyViewed` (the only home query that
 * actually depends on listing_views). Browsing N listings in a minute used
 * to fire N invalidations of the entire `home.all` subtree, refetching the
 * feed + stories on every detail view.
 */
export function useRecordListingView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, userId }: RecordListingViewArgs) => {
      // Errors are intentionally swallowed — analytics shouldn't surface as
      // user-visible failures, and there's no retry value here.
      await supabase.from('listing_views').upsert(
        { listing_id: listingId, user_id: userId, viewed_at: new Date().toISOString() },
        { onConflict: 'listing_id,user_id' },
      );
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.home.recentlyViewed(userId) });
    },
  });
}

interface AssignListingCollectionArgs {
  listingId: string;
  collectionId: string | null;
}

/**
 * Assigns (or un-assigns) a listing to a Pro collection. Only invalidates
 * `myListings.all` because the collection_id field is consumed exclusively
 * by the seller's Pro dashboard — browse, search, listing detail, and home
 * don't surface it.
 */
export function useAssignListingCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, collectionId }: AssignListingCollectionArgs) => {
      const { error } = await supabase
        .from('listings')
        .update({ collection_id: collectionId })
        .eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
    },
  });
}

interface BulkUpdatePricesArgs {
  // One entry per listing whose price actually changed. The hook recomputes
  // isPriceDrop server-side from currentPrice → newPrice so the price-drop
  // badge fields (`original_price`, `price_dropped_at`) stay in lockstep with
  // the price write.
  updates: {
    listingId: string;
    currentPrice: number;
    newPrice: number;
  }[];
}

// Thrown when at least one row in a bulk price update failed but others
// succeeded. Carries counts so the caller can render a "X of N updated" toast
// instead of all-or-nothing — important because Promise.all would short-circuit
// on the first reject while leaving the other in-flight writes to land
// silently in the background.
export class BulkUpdatePartialFailureError extends Error {
  constructor(
    public readonly succeededCount: number,
    public readonly failedCount: number,
    public readonly total: number,
  ) {
    super(`Updated ${succeededCount} of ${total} listings`);
    this.name = 'BulkUpdatePartialFailureError';
  }
}

/**
 * Bulk price update from the Pro BulkEditSheet. Runs N independent updates
 * in parallel (`Promise.allSettled`), one per listing, so each row's price-
 * drop fields can diverge based on its own old vs new price. allSettled (vs
 * the previous `Promise.all`) means an early failure doesn't short-circuit
 * the others, so the user sees an accurate partial-success count instead of
 * "all failed" while half the prices already changed in the background.
 *
 * For drops, sets `original_price` to the previous price and stamps
 * `price_dropped_at = now` so cards can render the strikethrough + "Reduced"
 * badge. For increases or restores, clears both fields.
 *
 * If every update succeeds, resolves normally. If at least one failed, throws
 * `BulkUpdatePartialFailureError` carrying the counts so callers can show a
 * specific toast (and the cache is still invalidated to reflect partial
 * progress).
 *
 * Invalidates myListings.all (seller's Selling tab), listings.all (browse +
 * search caches show prices, including price-asc/desc sort variants), and
 * home.all (Suggested / New arrivals price tags).
 */
export function useBulkUpdatePrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ updates }: BulkUpdatePricesArgs) => {
      const now = new Date().toISOString();
      const results = await Promise.allSettled(
        updates.map(async ({ listingId, currentPrice, newPrice }) => {
          const isPriceDrop = newPrice < currentPrice;
          const patch = isPriceDrop
            ? { price: newPrice, original_price: currentPrice, price_dropped_at: now }
            : { price: newPrice, original_price: null, price_dropped_at: null };
          const { error } = await supabase
            .from('listings')
            .update(patch)
            .eq('id', listingId);
          if (error) throw error;
        }),
      );
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        throw new BulkUpdatePartialFailureError(
          results.length - failedCount,
          failedCount,
          results.length,
        );
      }
    },
    onSettled: () => {
      // Use onSettled (not onSuccess) so partial-failure paths still refresh
      // caches — some rows did update and the UI should reflect that.
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}
