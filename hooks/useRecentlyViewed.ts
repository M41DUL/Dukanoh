import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';

const MAX = 10;

export async function recordView(id: string, userId: string) {
  // Insert into listing_views — duplicates are fine, we deduplicate on read
  await supabase.from('listing_views').insert({ listing_id: id, user_id: userId });
}

export function useRecentlyViewed(currentUserId?: string) {
  const [items, setItems] = useState<Listing[]>([]);

  const load = useCallback(async () => {
    if (!currentUserId) { setItems([]); return; }

    // Fetch recent views ordered newest first, then deduplicate client-side
    const { data: views, error } = await supabase
      .from('listing_views')
      .select('listing_id, viewed_at')
      .eq('user_id', currentUserId)
      .order('viewed_at', { ascending: false })
      .limit(100);

    if (error || !views) { setItems([]); return; }

    // Deduplicate: keep first (most recent) occurrence of each listing_id
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of views) {
      if (!seen.has(row.listing_id) && ids.length < MAX) {
        seen.add(row.listing_id);
        ids.push(row.listing_id);
      }
    }

    if (ids.length === 0) { setItems([]); return; }

    const { data, error: listingError } = await supabase
      .from('listings')
      .select('*, seller:users!listings_seller_id_fkey(username, avatar_url)')
      .in('id', ids)
      .eq('status', 'available')
      .neq('seller_id', currentUserId);

    if (listingError || !data) { setItems([]); return; }

    // Preserve view-recency order
    const map = new Map((data as unknown as Listing[]).map(l => [l.id, l]));
    setItems(ids.map(id => map.get(id)).filter(Boolean) as Listing[]);
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  return { items, reload: load };
}
