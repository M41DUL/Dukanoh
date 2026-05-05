// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/components/ListingCard';
import { compressImage, extractStoragePath } from './imageUtils';
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
 * NOTE: callers in app/listing/[id].tsx (conversation insert), app/conversation/[id].tsx
 * (mark-as-read updates), and message inserts in app/listing/[id].tsx +
 * app/conversation/[id].tsx all affect inbox data via DB triggers and the
 * realtime subscription. They carry TODO(tanstack-migrate) breadcrumbs.
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
    },
  });
}
