import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';

const KEY = '@dukanoh/recently_viewed';
const MAX = 8;

export async function recordView(id: string) {
  const raw = await AsyncStorage.getItem(KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const updated = [id, ...ids.filter(i => i !== id)].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(updated));
}

export function useRecentlyViewed(currentUserId?: string) {
  const [items, setItems] = useState<Listing[]>([]);

  const load = useCallback(async () => {
    const raw = await AsyncStorage.getItem(KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (ids.length === 0) { setItems([]); return; }

    const { data } = await supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url)')
      .in('id', ids)
      .eq('status', 'available');

    if (!data) { setItems([]); return; }

    // Preserve AsyncStorage order and filter out own listings
    const map = new Map((data as unknown as Listing[]).map(l => [l.id, l]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean) as Listing[];
    setItems(currentUserId ? ordered.filter(l => (l as any).seller_id !== currentUserId) : ordered);
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  return { items, reload: load };
}
