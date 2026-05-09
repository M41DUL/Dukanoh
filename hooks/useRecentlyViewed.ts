import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { queryKeys } from '@/lib/queryKeys';

const MAX = 10;

export async function recordView(id: string, userId: string) {
  await supabase.from('listing_views').upsert(
    { listing_id: id, user_id: userId, viewed_at: new Date().toISOString() },
    { onConflict: 'listing_id,user_id' }
  );
}

async function fetchRecentlyViewed(userId: string, signal: AbortSignal): Promise<Listing[]> {
  const { data: views, error: viewsError } = await supabase
    .from('listing_views')
    .select('listing_id')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(MAX)
    .abortSignal(signal);
  if (viewsError) throw viewsError;
  if (!views || views.length === 0) return [];

  const ids = views
    .map(row => row.listing_id)
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('listings')
    .select('id, title, price, original_price, price_dropped_at, images, status, condition, size, save_count, created_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier)')
    .in('id', ids)
    .eq('status', 'available')
    .neq('seller_id', userId)
    .abortSignal(signal);
  if (error) throw error;
  if (!data) return [];

  // Preserve view-recency order
  const map = new Map(data.map(l => [l.id, l]));
  return ids
    .map(id => map.get(id))
    .filter((l): l is NonNullable<typeof l> => l != null) as Listing[];
}

export function useRecentlyViewed(currentUserId?: string) {
  const query = useQuery({
    queryKey: queryKeys.home.recentlyViewed(currentUserId),
    queryFn: ({ signal }) => fetchRecentlyViewed(currentUserId!, signal),
    enabled: !!currentUserId,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
