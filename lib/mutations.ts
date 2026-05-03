// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/components/ListingCard';
import { supabase } from './supabase';
import { queryKeys } from './queryKeys';

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
