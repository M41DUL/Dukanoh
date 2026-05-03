// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/components/ListingCard';
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
 * Optimistically removes the listing from any cached saved-items list while
 * the network call is in flight, and rolls back on error. After success it
 * invalidates the parent `savedItems.all` key so any list/detail variant
 * refetches.
 *
 * NOTE: as of the saved.tsx migration, the heart-toggle UI in
 * components/ListingCard, app/listing/[id], and components/StoriesRow still
 * goes through context/SavedContext.toggleSave. Those callers should switch
 * to this hook when their respective screens are migrated.
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
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Listing[]>(listKey);

      if (isCurrentlySaved && previous) {
        queryClient.setQueryData<Listing[]>(
          listKey,
          previous.filter(item => item.id !== listingId),
        );
      }
      // For un-save → save we don't have the full listing row to insert,
      // so we leave the cache and rely on invalidation after success.

      return { previous, listKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.listKey, context.previous);
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
