import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface SavedContextValue {
  savedIds: Set<string>;
  isSaved: (id: string) => boolean;
  toggleSave: (listingId: string, price?: number) => Promise<void>;
  reload: () => Promise<void>;
}

const SavedContext = createContext<SavedContextValue>({
  savedIds: new Set(),
  isSaved: () => false,
  toggleSave: async () => {},
  reload: async () => {},
});

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_items')
      .select('listing_id')
      .eq('user_id', user.id)
      .limit(1000);
    if (data) {
      setSavedIds(new Set(data.map(d => d.listing_id as string)));
    }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const toggleSave = useCallback(async (listingId: string, price?: number) => {
    if (!user) return;
    if (savedIds.has(listingId)) {
      setSavedIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
      const { error } = await supabase.from('saved_items').delete().eq('user_id', user.id).eq('listing_id', listingId);
      if (error) setSavedIds(prev => new Set([...prev, listingId]));
    } else {
      setSavedIds(prev => new Set([...prev, listingId]));
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        listing_id: listingId,
        price_at_save: price ?? null,
      });
      if (error) setSavedIds(prev => { const s = new Set(prev); s.delete(listingId); return s; });
    }
  }, [user, savedIds]);

  return (
    <SavedContext.Provider value={{ savedIds, isSaved, toggleSave, reload }}>
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  return useContext(SavedContext);
}
