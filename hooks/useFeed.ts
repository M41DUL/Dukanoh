import { useState, useEffect, useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { proRankSort } from '@/utils/proRankSort';
import { queryKeys } from '@/lib/queryKeys';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// ── Keys & constants ────────────────────────────────────────────────
const nudgeKey = (uid: string) => `@dukanoh/profile_nudge_dismissed/${uid}`;
const sellNudgeKey = (uid: string) => `@dukanoh/sell_nudge_dismissed/${uid}`;
const fitSeenKey = (uid: string) => `@dukanoh/fit_sheet_seen/${uid}`;
const TRENDING_CACHE_KEY = (gender: 'Men' | 'Women' | null) =>
  `@dukanoh/trending_categories/${gender ?? 'all'}`;
const TRENDING_TTL_MS = 30 * 60 * 1000; // 30 min

// ── Exported types ──────────────────────────────────────────────────
export interface PriceDrop {
  listingId: string;
  title: string;
  images: string[];
  currentPrice: number;
  savedPrice: number;
}

export interface NudgeSlide {
  key: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  onDismiss?: () => void;
  gradientColors?: [string, string];
  iconColor?: string;
  iconBg?: string;
}

interface FeedData {
  suggested: Listing[];
  newArrivals: Listing[];
  trending: string[];
  priceDrops: PriceDrop[];
  preferredCategories: string[];
  hasListings: boolean;
  profileComplete: boolean;
}

// ── Private data helpers ────────────────────────────────────────────
async function getViewedCategories(userId: string, signal: AbortSignal): Promise<string[]> {
  const { data, error } = await supabase
    .from('listing_views')
    .select('listings(category)')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(50)
    .abortSignal(signal);
  if (error) throw error;
  if (!data) return [];
  return [...new Set(
    data
      .map(d => d.listings?.category)
      .filter((c): c is string => !!c)
  )];
}

async function getSavedSignals(userId: string, signal: AbortSignal): Promise<{ categories: string[]; occasions: string[] }> {
  const { data, error } = await supabase
    .from('saved_items')
    .select('listings(category, occasion)')
    .eq('user_id', userId)
    .limit(20)
    .abortSignal(signal);
  if (error) throw error;
  if (!data) return { categories: [], occasions: [] };
  return {
    categories: [...new Set(data.map(d => d.listings?.category).filter((c): c is string => !!c))],
    occasions:  [...new Set(data.map(d => d.listings?.occasion).filter((o): o is string => !!o))],
  };
}

interface ActiveSeason {
  categories: string[];
  weight: number;
}

async function fetchActiveSeason(signal: AbortSignal): Promise<ActiveSeason | null> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('seasonal_weights')
    .select('categories, weight')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function fetchTrendingCategories(
  gender: 'Men' | 'Women' | null,
  season: ActiveSeason | null,
  signal: AbortSignal,
): Promise<string[]> {
  const cacheKey = TRENDING_CACHE_KEY(gender);
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { categories, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TRENDING_TTL_MS) return categories;
    }
  } catch {}

  // Count saves per category in the last 7 days — measures buyer demand, not seller supply
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('saved_items')
    .select('listings(category, status)')
    .gte('created_at', since)
    .limit(100)
    .abortSignal(signal);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const counts = data.reduce<Record<string, number>>((acc, row) => {
    const listing = row.listings;
    const cat = listing?.category;
    if (!cat || listing?.status !== 'available') return acc;
    if (gender && cat !== gender) return acc; // gender filter
    // Apply seasonal weight multiplier to boost seasonal categories in ranking
    const multiplier = season?.categories.includes(cat) ? (season.weight ?? 1) : 1;
    acc[cat] = (acc[cat] ?? 0) + multiplier;
    return acc;
  }, {});

  const categories = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat]) => cat);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ categories, timestamp: Date.now() }));
  } catch {}

  return categories;
}

const SUGGESTED_SELECT = 'id, title, price, images, category, condition, size, created_at, seller_id, status, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified, tax_hold)';

// Suggested for You: no boosts, occasion signal, seller diversity cap, limit 10
async function fetchSuggestedSection(
  userId: string,
  categories: string[],
  occasions: string[],
  blockedIds: string[],
  signal: AbortSignal,
): Promise<Listing[]> {
  const buildBase = () => {
    let q = supabase
      .from('listings')
      .select(SUGGESTED_SELECT)
      .eq('status', 'available')
      .neq('seller_id', userId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(25); // fetch extra to allow for diversity filtering
    if (blockedIds.length > 0) q = q.not('seller_id', 'in', `(${blockedIds.join(',')})`);
    return q.abortSignal(signal);
  };

  // Run category and occasion queries in parallel, then merge. Each query
  // returns rows shaped by SUGGESTED_SELECT — Listing with the seller join.
  // Typed Supabase client infers the row shape; queries.push receives the
  // builder which is PromiseLike when awaited.
  const queries = [];
  if (categories.length > 0) queries.push(buildBase().in('category', categories));
  if (occasions.length > 0) queries.push(buildBase().in('occasion', occasions));
  if (queries.length === 0) return [];

  const results = await Promise.all(queries);
  for (const r of results) {
    if (r.error) throw r.error;
  }

  // Merge and deduplicate by listing id; exclude tax-held sellers
  const seen = new Set<string>();
  const merged: Listing[] = [];
  for (const { data } of results) {
    for (const item of data ?? []) {
      if (!seen.has(item.id) && !(item as Listing).seller?.tax_hold) {
        seen.add(item.id);
        merged.push(item as Listing);
      }
    }
  }

  // Re-sort merged results by published_at desc (fall back to created_at)
  merged.sort((a, b) => {
    const tb = b.published_at ?? b.created_at ?? '';
    const ta = a.published_at ?? a.created_at ?? '';
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  // Apply seller diversity cap: max 2 listings per seller
  const sellerCount = new Map<string, number>();
  const diverse = merged.filter(l => {
    const sid = l.seller_id;
    const count = sellerCount.get(sid) ?? 0;
    if (count >= 2) return false;
    sellerCount.set(sid, count + 1);
    return true;
  });

  return proRankSort(diverse).slice(0, 10);
}

// New Arrivals: gender-filtered, no boosts, seller diversity cap, limit 10
async function fetchNewArrivals(
  userId: string,
  gender: 'Men' | 'Women' | null,
  blockedIds: string[],
  signal: AbortSignal,
): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select(SUGGESTED_SELECT)
    .eq('status', 'available')
    .neq('seller_id', userId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(25); // fetch extra to allow for diversity filtering

  if (blockedIds.length > 0) query = query.not('seller_id', 'in', `(${blockedIds.join(',')})`);
  if (gender) query = query.in('category', [gender, 'Casualwear', 'Partywear', 'Festive', 'Formal', 'Achkan', 'Wedding', 'Pathani Suit', 'Shoes']);

  const { data, error } = await query.abortSignal(signal);
  if (error) throw error;
  const listings = ((data ?? []) as Listing[]).filter(
    l => !l.seller?.tax_hold,
  );
  if (listings.length === 0) return listings;

  // Apply seller diversity cap: max 2 listings per seller
  const sellerCount = new Map<string, number>();
  const diverse = listings.filter(l => {
    const sid = l.seller_id;
    const count = sellerCount.get(sid) ?? 0;
    if (count >= 2) return false;
    sellerCount.set(sid, count + 1);
    return true;
  });

  return proRankSort(diverse).slice(0, 10);
}

async function fetchFeedData(
  userId: string,
  blockedIds: string[],
  signal: AbortSignal,
): Promise<FeedData> {
  const profilePromise = supabase
    .from('users')
    .select('preferred_categories, avatar_url, bio')
    .eq('id', userId)
    .abortSignal(signal)
    .maybeSingle();

  const privateProfilePromise = supabase
    .from('user_private')
    .select('full_name')
    .eq('user_id', userId)
    .abortSignal(signal)
    .maybeSingle();

  const [profileRes, privateProfileRes, viewedCats, savedSignals, activeSeason] = await Promise.all([
    profilePromise,
    privateProfilePromise,
    getViewedCategories(userId, signal),
    getSavedSignals(userId, signal),
    fetchActiveSeason(signal),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (privateProfileRes.error) throw privateProfileRes.error;
  const profile = (profileRes.data || privateProfileRes.data)
    ? { ...profileRes.data, ...privateProfileRes.data }
    : null;

  const onboardingCats: string[] = profile?.preferred_categories ?? [];
  const allCats = [...new Set([...onboardingCats, ...viewedCats, ...savedSignals.categories])];
  const allOccasions = [...new Set(savedSignals.occasions)];
  const isComplete = !!(profile?.avatar_url && profile?.bio);

  // Derive gender for New Arrivals + Trending filters
  const prefersWomen = onboardingCats.includes('Women');
  const prefersMen = onboardingCats.includes('Men');
  const gender: 'Men' | 'Women' | null =
    prefersWomen && !prefersMen ? 'Women' :
    prefersMen && !prefersWomen ? 'Men' :
    null;

  // Trending now uses gender, save-count signal, and seasonal weights
  const trendingCats = await fetchTrendingCategories(gender, activeSeason, signal);

  // New-user fallback: if no category or occasion signal yet, use trending categories
  // Merge seasonal categories so Suggested for You surfaces them during active seasons
  const seasonalCats = activeSeason?.categories ?? [];
  const effectiveCats = [
    ...new Set([
      ...(allCats.length > 0 ? allCats : trendingCats),
      ...seasonalCats,
    ]),
  ];
  const hasSignal = effectiveCats.length > 0 || allOccasions.length > 0;

  const [suggestedItems, newArrivalItems, listingCountResult, savedPrices] = await Promise.all([
    hasSignal ? fetchSuggestedSection(userId, effectiveCats, allOccasions, blockedIds, signal) : Promise.resolve([]),
    fetchNewArrivals(userId, gender, blockedIds, signal),
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .abortSignal(signal),
    supabase
      .from('saved_items')
      .select('listing_id, price_at_save, listings(id, title, price, images, status)')
      .eq('user_id', userId)
      .not('price_at_save', 'is', null)
      .abortSignal(signal),
  ]);

  if (listingCountResult.error) throw listingCountResult.error;
  if (savedPrices.error) throw savedPrices.error;

  const userHasListings = (listingCountResult.count ?? 0) > 0;

  const PRICE_DROP_THRESHOLD = 0.10; // 10% minimum drop to surface

  const drops: PriceDrop[] = (savedPrices.data ?? [])
    .filter(s => {
      const l = s.listings as { price: number; status: string } | null;
      if (!l || l.status !== 'available') return false;
      const savedPrice = s.price_at_save as number;
      const pctDrop = (savedPrice - l.price) / savedPrice;
      return pctDrop >= PRICE_DROP_THRESHOLD;
    })
    .map(s => {
      const l = s.listings as { id: string; title: string; price: number; images: string[] };
      return {
        listingId: s.listing_id as string,
        title: l.title,
        images: l.images,
        currentPrice: l.price,
        savedPrice: s.price_at_save as number,
      };
    })
    // Sort by biggest percentage drop first
    .sort((a, b) => {
      const pctA = (a.savedPrice - a.currentPrice) / a.savedPrice;
      const pctB = (b.savedPrice - b.currentPrice) / b.savedPrice;
      return pctB - pctA;
    });

  return {
    suggested: suggestedItems,
    newArrivals: newArrivalItems,
    trending: trendingCats,
    priceDrops: drops,
    preferredCategories: effectiveCats,
    hasListings: userHasListings,
    profileComplete: isComplete,
  };
}

// ── Hook ────────────────────────────────────────────────────────────
interface UseFeedOptions {
  userId?: string;
  blockedIds?: string[];
}

export function useFeed({ userId, blockedIds = [] }: UseFeedOptions) {
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  const [sellNudgeDismissed, setSellNudgeDismissed] = useState(true);
  const [fitSheetSeen, setFitSheetSeen] = useState(true);

  // Load nudge dismissed state — UX local state, not server state
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      AsyncStorage.getItem(nudgeKey(userId)),
      AsyncStorage.getItem(sellNudgeKey(userId)),
      AsyncStorage.getItem(fitSeenKey(userId)),
    ]).then(([profileVal, sellVal, fitSeenVal]) => {
      setNudgeDismissed(profileVal === 'true');
      setSellNudgeDismissed(sellVal === 'true');
      setFitSheetSeen(fitSeenVal === 'true');
    });
  }, [userId]);

  const dismissNudge = useCallback(async () => {
    if (!userId) return;
    await AsyncStorage.setItem(nudgeKey(userId), 'true');
    setNudgeDismissed(true);
  }, [userId]);

  const dismissSellNudge = useCallback(async () => {
    if (!userId) return;
    await AsyncStorage.setItem(sellNudgeKey(userId), 'true');
    setSellNudgeDismissed(true);
  }, [userId]);

  const markFitSeen = useCallback(async () => {
    if (!userId) return;
    await AsyncStorage.setItem(fitSeenKey(userId), 'true');
    setFitSheetSeen(true);
  }, [userId]);

  const query = useQuery({
    queryKey: queryKeys.home.feed(userId, blockedIds),
    queryFn: ({ signal }) => fetchFeedData(userId!, blockedIds, signal),
    enabled: !!userId,
  });

  const data = query.data;

  const nudgeSlides = useMemo<NudgeSlide[]>(() => {
    const slides: NudgeSlide[] = [];
    const profileComplete = data?.profileComplete ?? true;
    const hasListings = data?.hasListings ?? true;
    if (!profileComplete && !nudgeDismissed) {
      slides.push({
        key: 'profile',
        icon: 'person-outline',
        title: 'Complete your profile',
        subtitle: 'Add a photo and bio to stand out',
        onPress: () => router.push('/(tabs)/profile'),
        onDismiss: dismissNudge,
      });
    }
    if (!hasListings && !sellNudgeDismissed) {
      slides.push({
        key: 'sell',
        icon: 'camera-outline',
        title: 'Start selling',
        subtitle: 'List your first item in minutes',
        onPress: () => router.push('/(tabs)/sell'),
        onDismiss: dismissSellNudge,
      });
    }
    return slides;
  }, [data, nudgeDismissed, sellNudgeDismissed, dismissNudge, dismissSellNudge]);

  return {
    suggested: data?.suggested ?? [],
    newArrivals: data?.newArrivals ?? [],
    trending: data?.trending ?? [],
    priceDrops: data?.priceDrops ?? [],
    preferredCategories: data?.preferredCategories ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    nudgeSlides,
    showFitNudge: !fitSheetSeen,
    markFitSeen,
  };
}
