import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from './useAuth';

// App stories: admin-authored broadcast cards shown under the Dukanoh
// bubble in the home feed. Headline / body / CTA are all optional —
// minimum viable story is just an image. See app/admin/stories.tsx.
export interface AppStory {
  type: 'app';
  id: string;
  imageUrl?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  ctaRoute?: string;
}

export type AppStoryDestination =
  | 'home'
  | 'search'
  | 'sell'
  | 'saved'
  | 'listings'
  | 'dukanoh-fit'
  | 'boosts'
  | 'specific-listing';

// Translate the persisted destination + listing id into a router path.
// Kept here (not a deep import in the composer) so the row -> route
// mapping has a single source of truth.
function destinationToRoute(dest: string | null, listingId: string | null): string | undefined {
  if (!dest) return undefined;
  switch (dest) {
    case 'home':         return '/(tabs)/';
    case 'search':       return '/(tabs)/search';
    case 'sell':         return '/(tabs)/sell';
    case 'saved':        return '/saved';
    case 'listings':     return '/listings';
    case 'dukanoh-fit':  return '/dukanoh-fit';
    case 'boosts':       return '/boosts';
    case 'specific-listing':
      return listingId ? `/listing/${listingId}` : undefined;
    default:             return undefined;
  }
}

async function fetchAppStories(signal: AbortSignal): Promise<AppStory[]> {
  const { data, error } = await supabase
    .from('app_stories')
    .select('id, image_url, headline, body, cta_label, cta_destination, cta_listing_id, expires_at')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('published_at', { ascending: false })
    .abortSignal(signal);

  if (error) throw error;

  return (data ?? []).map(row => ({
    type: 'app' as const,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    headline: row.headline ?? undefined,
    body: row.body ?? undefined,
    ctaLabel: row.cta_label ?? undefined,
    ctaRoute: destinationToRoute(row.cta_destination, row.cta_listing_id),
  }));
}

export function useAppStories() {
  const query = useQuery({
    queryKey: queryKeys.home.appStories(),
    queryFn: ({ signal }) => fetchAppStories(signal),
    staleTime: 60_000,
  });

  return {
    appStories: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

export interface StoryListing {
  type?: never;
  id: string;
  title: string;
  price: number;
  category?: string;
  condition?: string;
  images?: string[] | null;
  status?: string | null;
  viewed: boolean;
  is_boosted?: boolean;
  published_at?: string | null;
  seller_id?: string;
  seller?: {
    username?: string | null;
    avatar_url?: string | null;
    seller_tier?: string | null;
    is_verified?: boolean | null;
    tax_hold?: boolean | null;
  } | null;
}

const LISTING_SELECT =
  'id, title, price, images, category, condition, status, published_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified, tax_hold)';

async function fetchStories(userId: string, signal: AbortSignal): Promise<StoryListing[]> {
  // Organic window: 5 hours
  const since5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const [
    organicRes,
    boostsRes,
    savedRes,
    viewedRes,
    viewedStoriesRes,
  ] = await Promise.all([
    // Organic: published in last 5 hours, exclude own
    supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'available')
      .neq('seller_id', userId)
      .gte('published_at', since5h)
      .order('published_at', { ascending: false })
      .limit(50)
      .abortSignal(signal),

    // Active boosts from boosts table — source of truth
    supabase
      .from('boosts')
      .select('listing_id')
      .gt('expires_at', now)
      .abortSignal(signal),

    // Personalisation: categories from the user's saved items
    supabase
      .from('saved_items')
      .select('listing:listings(category)')
      .eq('user_id', userId)
      .abortSignal(signal),

    // Personalisation: recently viewed categories
    supabase
      .from('listing_views')
      .select('listing:listings(category)')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(30)
      .abortSignal(signal),

    // Already viewed stories
    supabase
      .from('story_views')
      .select('listing_id')
      .eq('user_id', userId)
      .abortSignal(signal),
  ]);

  if (organicRes.error) throw organicRes.error;
  if (boostsRes.error) throw boostsRes.error;
  if (savedRes.error) throw savedRes.error;
  if (viewedRes.error) throw viewedRes.error;
  if (viewedStoriesRes.error) throw viewedStoriesRes.error;

  // Fetch boosted listings by ID (exclude own)
  const boostedIds = (boostsRes.data ?? []).map(b => b.listing_id);
  let boostedListings: StoryListing[] = [];
  if (boostedIds.length > 0) {
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .in('id', boostedIds)
      .eq('status', 'available')
      .neq('seller_id', userId)
      .order('published_at', { ascending: false })
      .limit(20)
      .abortSignal(signal);
    if (error) throw error;
    boostedListings = (data ?? []) as StoryListing[];
  }

  const viewedIds = new Set(viewedStoriesRes.data?.map(s => s.listing_id) ?? []);

  const preferredCategories = new Set<string>([
    ...(savedRes.data?.map((s: any) => s.listing?.category).filter(Boolean) ?? []),
    ...(viewedRes.data?.map((v: any) => v.listing?.category).filter(Boolean) ?? []),
  ]);

  // Merge boosted + organic, dedup by id
  // Mark boosted listings with is_boosted flag for sort/display
  const boostedIdSet = new Set(boostedIds);
  const seenIds = new Set<string>();
  const merged: StoryListing[] = [];
  const organicListings = (organicRes.data ?? []) as StoryListing[];
  for (const l of [...boostedListings, ...organicListings]) {
    if (seenIds.has(l.id)) continue;
    if (l.seller?.tax_hold) continue;
    seenIds.add(l.id);
    merged.push({ ...l, is_boosted: boostedIdSet.has(l.id), viewed: false });
  }

  // Dedup to one listing per seller (keep most recently created — already ordered desc)
  const seenSellers = new Set<string>();
  const deduped: StoryListing[] = [];
  for (const l of merged) {
    const sellerId = l.seller_id ?? '';
    if (seenSellers.has(sellerId)) continue;
    seenSellers.add(sellerId);
    deduped.push(l);
  }

  // Sort: boosted unviewed → unviewed + preferred → unviewed → viewed
  const sorted = [...deduped].sort((a, b) => {
    const aViewed = viewedIds.has(a.id) ? 1 : 0;
    const bViewed = viewedIds.has(b.id) ? 1 : 0;
    if (aViewed !== bViewed) return aViewed - bViewed;

    // Both unviewed — boosted first
    const aBoosted = a.is_boosted ? 0 : 1;
    const bBoosted = b.is_boosted ? 0 : 1;
    if (aBoosted !== bBoosted) return aBoosted - bBoosted;

    // Then preferred category
    const aPref = a.category && preferredCategories.has(a.category) ? 0 : 1;
    const bPref = b.category && preferredCategories.has(b.category) ? 0 : 1;
    return aPref - bPref;
  });

  return sorted.map(l => ({
    ...l,
    viewed: viewedIds.has(l.id),
  }));
}

export function useStories() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.home.stories(userId),
    queryFn: ({ signal }) => fetchStories(userId!, signal),
    enabled: !!userId,
  });

  // Optimistically flip viewed=true in cache, then persist to DB.
  // The accompanying listing_views insert is fire-and-forget — it doesn't
  // affect the visible badge but feeds the recently-viewed signal.
  const markViewed = useCallback(async (listingId: string) => {
    if (!userId) return;
    queryClient.setQueryData<StoryListing[]>(
      queryKeys.home.stories(userId),
      prev => prev?.map(s => (s.id === listingId ? { ...s, viewed: true } : s)),
    );
    await Promise.all([
      supabase
        .from('story_views')
        .upsert({ user_id: userId, listing_id: listingId }),
      supabase
        .from('listing_views')
        .insert({ user_id: userId, listing_id: listingId }),
    ]);
  }, [userId, queryClient]);

  return {
    stories: query.data ?? [],
    loading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    markViewed,
  };
}
