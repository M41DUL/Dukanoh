import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { useToggleSavedItem } from '@/lib/mutations';

interface SavedContextValue {
  savedIds: Set<string>;
  isSaved: (id: string) => boolean;
  toggleSave: (listingId: string, price?: number) => void;
  reload: () => Promise<void>;
}

const SavedContext = createContext<SavedContextValue>({
  savedIds: new Set(),
  isSaved: () => false,
  toggleSave: () => {},
  reload: async () => {},
});

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: ids = [], refetch } = useQuery({
    queryKey: queryKeys.savedItems.ids(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('saved_items')
        .select('listing_id')
        .eq('user_id', userId)
        .limit(1000);
      if (error) throw error;
      return data?.map(d => d.listing_id as string) ?? [];
    },
    enabled: !!userId,
  });

  const savedIds = useMemo(() => new Set(ids), [ids]);
  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const toggleMutation = useToggleSavedItem();

  // Fire-and-forget. The hook owns optimistic updates + rollback; callers
  // (heart buttons on cards, listing detail, etc.) don't await.
  const toggleSave = useCallback((listingId: string, price?: number) => {
    if (!userId) return;
    toggleMutation.mutate({
      userId,
      listingId,
      isCurrentlySaved: savedIds.has(listingId),
      price,
    });
  }, [userId, savedIds, toggleMutation]);

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <SavedContext.Provider value={{ savedIds, isSaved, toggleSave, reload }}>
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  return useContext(SavedContext);
}
