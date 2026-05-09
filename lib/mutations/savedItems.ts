// Custom mutation hooks — each wraps a Supabase mutation and invalidates the relevant parent queryKey on success.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/components/ListingCard';
import { supabase } from '../supabase';
import { queryKeys } from '../queryKeys';

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
      // Dedupe on add: a fast double-tap can run two onMutate calls before
      // the first mutationFn resolves, and the second sees the first's
      // optimistic update as its "previous". Without the includes() guard
      // the listingId would land in the array twice until the post-success
      // invalidation refetched it.
      if (previousIds) {
        queryClient.setQueryData<string[]>(
          idsKey,
          isCurrentlySaved
            ? previousIds.filter(id => id !== listingId)
            : previousIds.includes(listingId)
              ? previousIds
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
