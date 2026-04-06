import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';

const KEY = (userId: string) => `@dukanoh/recently_viewed/${userId}`;
const MAX = 8;

export async function recordView(id: string, userId: string) {
  const raw = await AsyncStorage.getItem(KEY(userId));
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const updated = [id, ...ids.filter(i => i !== id)].slice(0, MAX);
  await AsyncStorage.setItem(KEY(userId), JSON.stringify(updated));
}

export function useRecentlyViewed(currentUserId?: string) {
  const [items, setItems] = useState<Listing[]>([]);

  const load = useCallback(async () => {
    if (!currentUserId) { setItems([]); return; }
    const raw = await AsyncStorage.getItem(KEY(currentUserId));
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (ids.length === 0) { setItems([]); return; }

    const { data, error } = await supabase
      .from('listings')
      .select('*, seller:users!listings_seller_id_fkey(username, avatar_url)')
      .in('id', ids)
      .eq('status', 'available');

    if (error) return;
    if (!data) { setItems([]); return; }

    // Preserve AsyncStorage order and filter out own listings
    const map = new Map((data as unknown as Listing[]).map(l => [l.id, l]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean) as Listing[];
    setItems(currentUserId ? ordered.filter(l => l.seller_id !== currentUserId) : ordered);
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  return { items, reload: load };
}
