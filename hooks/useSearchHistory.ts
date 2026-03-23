import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';

const RECENT_KEY = (userId: string) => `@dukanoh/recent_searches/${userId}`;
const MAX_RECENT = 6;

export const POPULAR_SEARCHES = [
  'Lehenga',
  'Sherwani',
  'Saree',
  'Kurta',
  'Anarkali',
  'Dupatta',
];

export function useSearchHistory() {
  const { user } = useAuth();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(RECENT_KEY(user.id)).then(val => {
      if (val) setRecentSearches(JSON.parse(val));
    });
  }, [user]);

  const saveSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed || !user) return;
    setRecentSearches(prev => {
      const deduped = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY(user.id), JSON.stringify(deduped));
      return deduped;
    });
  }, [user]);

  const removeSearch = useCallback((term: string) => {
    if (!user) return;
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== term);
      if (updated.length === 0) AsyncStorage.removeItem(RECENT_KEY(user.id));
      else AsyncStorage.setItem(RECENT_KEY(user.id), JSON.stringify(updated));
      return updated;
    });
  }, [user]);

  const clearSearches = useCallback(() => {
    if (!user) return;
    AsyncStorage.removeItem(RECENT_KEY(user.id));
    setRecentSearches([]);
  }, [user]);

  const filteredRecent = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      return q
        ? recentSearches.filter(s => s.toLowerCase().includes(q))
        : recentSearches;
    },
    [recentSearches],
  );

  return { recentSearches, filteredRecent, saveSearch, removeSearch, clearSearches };
}
