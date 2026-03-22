import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_KEY = '@dukanoh/recent_searches';
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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(val => {
      if (val) setRecentSearches(JSON.parse(val));
    });
  }, []);

  const saveSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const deduped = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
      return deduped;
    });
  }, []);

  const removeSearch = useCallback((term: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== term);
      if (updated.length === 0) AsyncStorage.removeItem(RECENT_KEY);
      else AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearSearches = useCallback(() => {
    AsyncStorage.removeItem(RECENT_KEY);
    setRecentSearches([]);
  }, []);

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
