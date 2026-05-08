// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { Listing } from '@/components/ListingCard';
import { compressImage, extractStoragePath } from './imageUtils';
import { edgeFetch } from './edgeFetch';
import { supabase } from './supabase';
import { queryKeys } from './queryKeys';

function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

interface ToggleSavedItemArgs {
  userId: string;
  listingId: string;
  isCurrentlySaved: boolean;
  price?: number;
}

/**
 * Toggles a saved_items row for (userId, listingId).
 *
 * Updates two caches optimistically: the lightweight ID set
 * (queryKeys.savedItems.ids) used by SavedContext to drive heart UI on every
 * card across the app, and the full saved-items list (queryKeys.savedItems.list)
 * used by the saved tab. Both roll back on error. After success, both
 * variants are invalidated via savedItems.all so they refetch fresh.
 */
export function useToggleSavedItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, listingId, isCurrentlySaved, price }: ToggleSavedItemArgs) => {
      if (isCurrentlySaved) {
        const { error } = await supabase
          .from('saved_items')
          .delete()
          .eq('user_id', userId)
          .eq('listing_id', listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_items')
          .insert({
            user_id: userId,
            listing_id: listingId,
            price_at_save: price ?? null,
          });
        if (error) throw error;
      }
    },
    onMutate: async ({ userId, listingId, isCurrentlySaved }) => {
      const listKey = queryKeys.savedItems.list(userId);
      const idsKey = queryKeys.savedItems.ids(userId);
      await queryClient.cancelQueries({ queryKey: queryKeys.savedItems.all });

      const previousList = queryClient.getQueryData<Listing[]>(listKey);
      const previousIds = queryClient.getQueryData<string[]>(idsKey);

      // Optimistic update for the IDs set — both add & remove, since we
      // know the listingId regardless of which direction the toggle goes.
      if (previousIds) {
        queryClient.setQueryData<string[]>(
          idsKey,
          isCurrentlySaved
            ? previousIds.filter(id => id !== listingId)
            : [...previousIds, listingId],
        );
      }

      // Optimistic update for the full list — only the un-save direction,
      // because for save → un-save we don't have the full Listing row to
      // insert. The post-success invalidation refetches it.
      if (isCurrentlySaved && previousList) {
        queryClient.setQueryData<Listing[]>(
          listKey,
          previousList.filter(item => item.id !== listingId),
        );
      }

      return { previousList, previousIds, listKey, idsKey };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      if (context.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.previousIds !== undefined) {
        queryClient.setQueryData(context.idsKey, context.previousIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems.all });
      // Save activity feeds Suggested-for-you, Trending categories, and
      // price-drop tracking on home, so the feed needs to refresh too.
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

// ─── Orders ───────────────────────────────────────────────────
//
// These are clean single-call wrappers around the order state-transition
// mutations. They all invalidate `queryKeys.orders.all` so any cached
// sold/bought list refetches after the transition.
//
// Multi-step flows (cancel-with-refund in app/order/[id]/index.tsx, the
// admin resolve-with-refund flow in app/admin/disputes.tsx, and the
// checkout insert in app/checkout/[listingId].tsx) are NOT wrapped here —
// their final shape depends on how their owner screens migrate. Those
// sites carry TODO(tanstack-migrate) breadcrumbs that point back here.

interface MarkOrderShippedArgs {
  orderId: string;
  sellerId: string;
  trackingNumber: string;
  courier?: string;
}

export function useMarkOrderShipped() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, sellerId, trackingNumber, courier }: MarkOrderShippedArgs) => {
      const { error } = await supabase.rpc('mark_order_shipped', {
        p_order_id: orderId,
        p_seller_id: sellerId,
        p_tracking: trackingNumber,
        p_courier: courier,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface ConfirmOrderReceiptArgs {
  orderId: string;
  buyerId: string;
}

export function useConfirmOrderReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId }: ConfirmOrderReceiptArgs) => {
      const { error } = await supabase.rpc('confirm_order_receipt', {
        p_order_id: orderId,
        p_buyer_id: buyerId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface RaiseDisputeArgs {
  orderId: string;
  buyerId: string;
  reason: string;
  description: string;
}

export function useRaiseDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId, reason, description }: RaiseDisputeArgs) => {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'disputed',
          dispute_reason: reason,
          dispute_description: description,
          disputed_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('buyer_id', buyerId)
        .in('status', ['shipped', 'delivered']);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

interface WithdrawDisputeArgs {
  orderId: string;
  buyerId: string;
}

export function useWithdrawDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, buyerId }: WithdrawDisputeArgs) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          delivered_at: now,
          completed_at: now,
        })
        .eq('id', orderId)
        .eq('buyer_id', buyerId);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// Discriminated on `cancelledBy` so the seller branch requires `sellerId` —
// otherwise the strike insert would silently skip with no compile error.
type CancelOrderArgs =
  | { orderId: string; listingId: string | null; cancelledBy: 'buyer' }
  | { orderId: string; listingId: string | null; cancelledBy: 'seller'; sellerId: string };

/**
 * Cancels an order: refunds the buyer via the stripe-refund edge function,
 * marks the order cancelled, returns the listing to `available`, and (for
 * seller-cancelled orders) inserts a row into `cancellation_strikes`.
 *
 * All four steps must succeed — any failure throws and the caller's catch
 * runs. The mutation is not transactional across the edge function and the
 * three Supabase writes, so a refund could conceivably succeed while a
 * later step fails; that's the same shape the inline flow had pre-migration.
 *
 * Invalidates orders.all (refreshing both list + detail under the hierarchical
 * key) and myListings.all (so the listing returns to the seller's Selling tab).
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: CancelOrderArgs) => {
      const { orderId, listingId, cancelledBy } = args;
      const refundRes = await edgeFetch('stripe-refund', { order_id: orderId });
      if (!refundRes.ok) {
        const err = await refundRes.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Refund failed');
      }
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: cancelledBy,
        })
        .eq('id', orderId);
      if (orderErr) throw orderErr;
      if (listingId) {
        const { error: listingErr } = await supabase
          .from('listings')
          .update({ status: 'available', buyer_id: null, sold_at: null })
          .eq('id', listingId);
        if (listingErr) throw listingErr;
      }
      if (args.cancelledBy === 'seller') {
        const { error: strikeErr } = await supabase
          .from('cancellation_strikes')
          .insert({ seller_id: args.sellerId, order_id: orderId });
        if (strikeErr) throw strikeErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      // Cancelled listing returns to Suggested / New arrivals on home and to
      // browse/search caches.
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface ResolveDisputeArgs {
  orderId: string;
  listingId: string | null;
  outcome: 'release_seller' | 'refund_buyer';
  note: string;
}

/**
 * Admin resolution of a disputed order.
 *
 * For `refund_buyer`, fires the Stripe refund edge function first and
 * relists the item (status → available, buyer_id null, sold_at null) so
 * it returns to the home feed. For `release_seller`, only writes the
 * resolution fields — the wallet credit is deferred until the 7-day
 * appeal window closes (handled by the auto_release_orders job).
 *
 * Both branches stamp `appeal_deadline_at` 7 days out and gate the orders
 * update on `status = 'disputed'` so a double-tap can't double-resolve.
 *
 * Invalidates adminDisputes.all (this screen), orders.all (buyer + seller
 * order lists, order detail), listings.all + home.all + myListings.all
 * (refunded path relists the item).
 */
export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, listingId, outcome, note }: ResolveDisputeArgs) => {
      const now = new Date().toISOString();
      const appealDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (outcome === 'refund_buyer') {
        const refundRes = await edgeFetch('stripe-refund', { order_id: orderId });
        if (!refundRes.ok) {
          const err = await refundRes.json().catch(() => ({}));
          throw new Error(err?.error ?? 'Could not process refund. Please try again.');
        }
      }

      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          status: 'resolved',
          resolution_outcome: outcome,
          resolution_note: note,
          resolved_at: now,
          appeal_deadline_at: appealDeadline,
        })
        .eq('id', orderId)
        .eq('status', 'disputed');
      if (orderErr) throw orderErr;

      if (outcome === 'refund_buyer' && listingId) {
        const { error: listingErr } = await supabase
          .from('listings')
          .update({ status: 'available', buyer_id: null, sold_at: null })
          .eq('id', listingId);
        if (listingErr) throw listingErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminDisputes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}

interface AppealDisputeArgs {
  orderId: string;
  appealedBy: 'buyer' | 'seller';
  reason: string;
}

export function useAppealDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, appealedBy, reason }: AppealDisputeArgs) => {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'disputed',
          appealed_at: new Date().toISOString(),
          appeal_by: appealedBy,
          appeal_reason: reason,
        })
        .eq('id', orderId)
        .eq('status', 'resolved');
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// ─── Conversations ────────────────────────────────────────────

interface CreateConversationArgs {
  listingId: string;
  buyerId: string;
  sellerId: string;
}

/**
 * Find-or-create the (listing_id, buyer_id) conversation. Returns the
 * conversation id either way. The 23505 retry guards against a race where
 * two near-simultaneous taps both miss the initial select and try to insert;
 * only one wins and the other re-selects the row that just landed.
 *
 * Callers (handleMessage / handleOffer on the listing detail screen) chain
 * navigation or useSendMessage on the returned id.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, buyerId, sellerId }: CreateConversationArgs): Promise<string> => {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', buyerId)
        .maybeSingle();
      if (existing) return existing.id as string;

      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
        .select('id')
        .single();

      if (error?.code === '23505') {
        const { data: retry, error: retryErr } = await supabase
          .from('conversations')
          .select('id')
          .eq('listing_id', listingId)
          .eq('buyer_id', buyerId)
          .single();
        if (retryErr) throw retryErr;
        return retry.id as string;
      }
      if (error) throw error;
      return created.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

interface SendMessageArgs {
  conversationId: string;
  listingId: string | null;
  senderId: string;
  receiverId: string;
  content: string;
}

/**
 * Inserts a row into `messages`. The DB trigger updates
 * `conversations.last_message`, so the inbox realtime subscription picks the
 * change up; this hook also explicitly invalidates the per-conversation
 * messages cache + inbox.all so the canonical row replaces any optimistic
 * stub once the round trip completes.
 *
 * The `__OFFER__:` / `__OFFER_ACCEPTED__:offerId:amount` /
 * `__OFFER_DECLINED__:offerId:amount` payload format is part of the content
 * string, not the hook signature — callers compose it themselves.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, listingId, senderId, receiverId, content }: SendMessageArgs) => {
      const { error } = await supabase.from('messages').insert({
        id: Crypto.randomUUID(),
        conversation_id: conversationId,
        listing_id: listingId,
        sender_id: senderId,
        receiver_id: receiverId,
        content,
      });
      // 23505 = unique constraint violation. Treat as success because the
      // realtime echo + retry path can race a successful insert; surfacing
      // it as an error would show a spurious "Failed to send" alert for a
      // message that did, in fact, land.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.messages(vars.conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
    },
  });
}

interface MarkConversationReadArgs {
  conversationId: string;
}

/**
 * Clears `last_message_sender_id` on a conversation row, which is how the
 * inbox computes the unread dot (unread = last_message_sender_id is set and
 * != current user). Invalidates both inbox.all (so unread badges update) and
 * conversations.all (so the open thread's metadata reflects the cleared
 * state if the user backs out and returns).
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId }: MarkConversationReadArgs) => {
      const { error } = await supabase
        .from('conversations')
        .update({ last_message_sender_id: null })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

interface DeleteConversationArgs {
  conversationId: string;
  isBuyer: boolean;
  userId: string;
}

/**
 * Soft-deletes a conversation for the current user (sets either
 * `deleted_by_buyer` or `deleted_by_seller` to true depending on role).
 *
 * Optimistically removes the row from the cached inbox list, rolls back on
 * error, and invalidates `inbox.all` on success. The other party still sees
 * the conversation — this is a per-side hide, not a true delete.
 *
 * NOTE: app/listing/[id].tsx still does its own conversation insert + offer
 * message insert and carries TODO(tanstack-migrate) breadcrumbs that point at
 * useSendMessage. Those write paths fire DB triggers + realtime that this
 * screen relies on, so any migration of listing/[id].tsx must keep that wiring.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, isBuyer }: DeleteConversationArgs) => {
      const field = isBuyer ? 'deleted_by_buyer' : 'deleted_by_seller';
      const { error } = await supabase
        .from('conversations')
        .update({ [field]: true })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async ({ conversationId, userId }) => {
      const listKey = queryKeys.inbox.list(userId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<{ id: string }[]>(listKey);
      if (previous) {
        queryClient.setQueryData(
          listKey,
          previous.filter(c => c.id !== conversationId),
        );
      }
      return { previous, listKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
    },
  });
}

// ─── Listings ─────────────────────────────────────────────────

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
  images: string[];
  newStatus: 'draft' | 'available';
}

// Compress + upload any local image URIs in `images`; pass through existing
// http(s) URLs unchanged. Returns the final ordered list of public URLs.
async function uploadListingImages(images: string[], userId: string): Promise<string[]> {
  const result: string[] = [];
  for (const uri of images) {
    if (uri.startsWith('http')) {
      result.push(uri);
      continue;
    }
    const compressed = await compressImage(uri);
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const response = await fetch(compressed);
    const arrayBuffer = await response.arrayBuffer();
    const { error } = await supabase.storage
      .from('listings')
      .upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });
    if (error) throw new Error(`Failed to upload photo: ${error.message}`);
    const { data } = supabase.storage.from('listings').getPublicUrl(fileName);
    result.push(data.publicUrl);
  }
  return result;
}

/**
 * Saves an edited listing: uploads any newly-added local images, then writes
 * the patch + status (and bumps `published_at` when publishing) to the row.
 * Invalidates `listings.all` and `myListings.all` on success.
 */
export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, userId, patch, images, newStatus }: UpdateListingArgs) => {
      const imageUrls = await uploadListingImages(images, userId);
      const { error } = await supabase
        .from('listings')
        .update({
          ...patch,
          images: imageUrls,
          status: newStatus,
          ...(newStatus === 'available' ? { published_at: new Date().toISOString() } : {}),
        })
        .eq('id', listingId);
      if (error) throw error;
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

/**
 * Inserts a new draft listing seeded from the source listing's fields.
 * Returns the new listing id so the caller can navigate to its edit screen.
 * Invalidates myListings.all so the new draft appears in the Drafts tab.
 */
export function useDuplicateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sellerId, source }: DuplicateListingArgs): Promise<string> => {
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
          images: source.images,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.home.all });
    },
  });
}
