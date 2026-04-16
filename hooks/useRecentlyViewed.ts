import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';

const MAX = 10;

export async function recordView(id: string, userId: string) {
  await supabase.from('listing_views').upsert(
    { listing_id: id, user_id: userId, viewed_at: new Date().toISOString() },
    { onConflict: 'listing_id,user_id' }
  );
}

export function useRecentlyViewed(currentUserId?: string) {
  const [items, setItems] = useState<Listing[]>([]);

  const load = useCallback(async () => {
    if (!currentUserId) { setItems([]); return; }

    const { data: views, error } = await supabase
      .from('listing_views')
      .select('listing_id')
      .eq('user_id', currentUserId)
      .order('viewed_at', { ascending: false })
      .limit(MAX);

    if (error || !views || views.length === 0) { setItems([]); return; }

    const ids = views.map(row => row.listing_id);

    const { data, error: listingError } = await supabase
      .from('listings')
      .select('id, title, price, original_price, price_dropped_at, images, status, condition, size, save_count, created_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier)')
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
