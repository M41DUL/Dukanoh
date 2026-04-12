import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { proRankSort } from '@/utils/proRankSort';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// ── Keys & constants ────────────────────────────────────────────────
const nudgeKey = (uid: string) => `@dukanoh/profile_nudge_dismissed/${uid}`;
const sellNudgeKey = (uid: string) => `@dukanoh/sell_nudge_dismissed/${uid}`;
const fitSeenKey = (uid: string) => `@dukanoh/fit_sheet_seen/${uid}`;
const FEED_CACHE_KEY = (uid: string) => `@dukanoh/feed_cache/${uid}`;
const RECENTLY_VIEWED_KEY = (uid: string) => `@dukanoh/recently_viewed/${uid}`;
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

interface FeedCache {
  suggested: Listing[];
  newArrivals: Listing[];
  trending: string[];
  priceDrops: PriceDrop[];
  preferredCategories: string[];
  hasListings: boolean;
  profileComplete: boolean;
  timestamp: number;
}

// ── Private data helpers ────────────────────────────────────────────
async function getViewedCategories(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY(userId));
    if (!raw) return [];
    const ids: string[] = JSON.parse(raw);
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from('listings')
      .select('category')
      .in('id', ids);
    if (!data) return [];
    return [...new Set(data.map(d => d.category))];
  } catch {
    return [];
  }
}

async function getSavedCategories(userId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('saved_items')
      .select('listings(category)')
      .eq('user_id', userId)
      .limit(20);
    if (!data) return [];
    return [...new Set(
      data
        .map(d => (d.listings as any)?.category)
        .filter(Boolean) as string[]
    )];
  } catch {
    return [];
  }
}

async function getSavedOccasions(userId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('saved_items')
      .select('listings(occasion)')
      .eq('user_id', userId)
      .limit(20);
    if (!data) return [];
    return [...new Set(
      data
        .map(d => (d.listings as any)?.occasion)
        .filter(Boolean) as string[]
    )];
  } catch {
    return [];
  }
}

interface ActiveSeason {
  categories: string[];
  weight: number;
}

async function fetchActiveSeason(): Promise<ActiveSeason | null> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('seasonal_weights')
    .select('categories, weight')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function fetchTrendingCategories(
  gender: 'Men' | 'Women' | null,
  season: ActiveSeason | null,
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
  const { data } = await supabase
    .from('saved_items')
    .select('listings(category, status)')
    .gte('created_at', since)
    .limit(100);

  if (!data || data.length === 0) return [];

  const counts = data.reduce<Record<string, number>>((acc, row) => {
    const listing = row.listings as any;
    const cat: string | undefined = listing?.category;
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

const SUGGESTED_SELECT = 'id, title, price, images, category, condition, size, created_at, seller_id, status, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)';

// Suggested for You: no boosts, occasion signal, seller diversity cap, limit 10
async function fetchSuggestedSection(
  userId: string,
  categories: string[],
  occasions: string[],
  blockedIds: string[] = [],
): Promise<Listing[]> {
  const buildBase = () => {
    let q = supabase
      .from('listings')
      .select(SUGGESTED_SELECT)
      .eq('status', 'available')
      .neq('seller_id', userId)
      .order('created_at', { ascending: false })
      .limit(25); // fetch extra to allow for diversity filtering
    if (blockedIds.length > 0) q = q.not('seller_id', 'in', `(${blockedIds.join(',')})`);
    return q;
  };

  // Run category and occasion queries in parallel, then merge
  const queries: Promise<{ data: any[] | null }>[] = [];
  if (categories.length > 0) queries.push(buildBase().in('category', categories) as any);
  if (occasions.length > 0) queries.push(buildBase().in('occasion', occasions) as any);
  if (queries.length === 0) return [];

  const results = await Promise.all(queries);

  // Merge and deduplicate by listing id
  const seen = new Set<string>();
  const merged: Listing[] = [];
  for (const { data } of results) {
    for (const item of (data ?? []) as Listing[]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }

  // Re-sort merged results by newest first
  merged.sort((a, b) =>
    new Date((b as any).created_at).getTime() - new Date((a as any).created_at).getTime()
  );

  // Apply seller diversity cap: max 2 listings per seller
  const sellerCount = new Map<string, number>();
  const diverse = merged.filter(l => {
    const sid = (l as any).seller_id as string;
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
  blockedIds: string[] = [],
): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select(SUGGESTED_SELECT)
    .eq('status', 'available')
    .neq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(25); // fetch extra to allow for diversity filtering

  if (blockedIds.length > 0) query = query.not('seller_id', 'in', `(${blockedIds.join(',')})`);
  if (gender) query = query.eq('category', gender);

  const { data } = await query;
  const listings = (data ?? []) as unknown as Listing[];
  if (listings.length === 0) return listings;

  // Apply seller diversity cap: max 2 listings per seller
  const sellerCount = new Map<string, number>();
  const diverse = listings.filter(l => {
    const sid = (l as any).seller_id as string;
    const count = sellerCount.get(sid) ?? 0;
    if (count >= 2) return false;
    sellerCount.set(sid, count + 1);
    return true;
  });

  return proRankSort(diverse).slice(0, 10);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Hook ────────────────────────────────────────────────────────────
interface UseFeedOptions {
  userId?: string;
  blockedIds?: string[];
  reloadRecent: () => void;
}

export function useFeed({ userId, blockedIds = [], reloadRecent }: UseFeedOptions) {
  const [suggested, setSuggested] = useState<Listing[]>([]);
  const [newArrivals, setNewArrivals] = useState<Listing[]>([]);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  const [sellNudgeDismissed, setSellNudgeDismissed] = useState(true);
  const [fitSheetSeen, setFitSheetSeen] = useState(true);
  const [hasListings, setHasListings] = useState(true);
  const hasMounted = useRef(false);
  const lastLoadedAt = useRef(0);

  // Load nudge dismissed state
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

  const applyFeedData = useCallback((data: Omit<FeedCache, 'timestamp'>) => {
    setSuggested(data.suggested);
    setNewArrivals(data.newArrivals);
    setTrending(data.trending);
    setPriceDrops(data.priceDrops);
    setPreferredCategories(data.preferredCategories);
    setHasListings(data.hasListings);
    setProfileComplete(data.profileComplete);
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;

    try {
      const [profile, viewedCats, savedCats, savedOccasions, activeSeason] = await Promise.all([
        supabase
          .from('users')
          .select('preferred_categories, avatar_url, bio, full_name')
          .eq('id', userId)
          .maybeSingle()
          .then(r => r.data),
        getViewedCategories(userId),
        getSavedCategories(userId),
        getSavedOccasions(userId),
        fetchActiveSeason(),
      ]);

      const onboardingCats: string[] = profile?.preferred_categories ?? [];
      const allCats = [...new Set([...onboardingCats, ...viewedCats, ...savedCats])];
      const allOccasions = [...new Set(savedOccasions)];
      const isComplete = !!(profile?.avatar_url && profile?.bio);
      const rawName = profile?.full_name ?? '';
      const firstName = rawName === 'New User' ? '' : rawName.split(' ')[0];
      setDisplayName(firstName);

      // Derive gender for New Arrivals + Trending filters
      const prefersWomen = onboardingCats.includes('Women');
      const prefersMen = onboardingCats.includes('Men');
      const gender: 'Men' | 'Women' | null =
        prefersWomen && !prefersMen ? 'Women' :
        prefersMen && !prefersWomen ? 'Men' :
        null;

      // Trending now uses gender, save-count signal, and seasonal weights
      const trendingCats = await fetchTrendingCategories(gender, activeSeason);

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
        hasSignal ? fetchSuggestedSection(userId, effectiveCats, allOccasions, blockedIds) : Promise.resolve([]),
        fetchNewArrivals(userId, gender, blockedIds),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', userId),
        supabase
          .from('saved_items')
          .select('listing_id, price_at_save, listings(id, title, price, images, status)')
          .eq('user_id', userId)
          .not('price_at_save', 'is', null),
      ]);

      const userHasListings = (listingCountResult.count ?? 0) > 0;

      const PRICE_DROP_THRESHOLD = 0.10; // 10% minimum drop to surface

      const drops: PriceDrop[] = (savedPrices.data ?? [])
        .filter(s => {
          const l = s.listings as unknown as { price: number; status: string } | null;
          if (!l || l.status !== 'available') return false;
          const savedPrice = s.price_at_save as number;
          const pctDrop = (savedPrice - l.price) / savedPrice;
          return pctDrop >= PRICE_DROP_THRESHOLD;
        })
        .map(s => {
          const l = s.listings as unknown as { id: string; title: string; price: number; images: string[] };
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

      const feedData: Omit<FeedCache, 'timestamp'> = {
        suggested: suggestedItems,
        newArrivals: newArrivalItems,
        trending: trendingCats,
        priceDrops: drops,
        preferredCategories: effectiveCats,
        hasListings: userHasListings,
        profileComplete: isComplete,
      };

      applyFeedData(feedData);
      lastLoadedAt.current = Date.now();

      try {
        await AsyncStorage.setItem(
          FEED_CACHE_KEY(userId),
          JSON.stringify({ ...feedData, timestamp: Date.now() }),
        );
      } catch {}
    } catch {
      // Prevent infinite skeleton — fall back to empty state
      setLoading(false);
    }
  }, [userId, applyFeedData, blockedIds]);

  // On mount: load cache instantly, then refresh from network
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FEED_CACHE_KEY(userId));
        if (raw && !cancelled) {
          const cached: FeedCache = JSON.parse(raw);
          applyFeedData(cached);
          setLoading(false);
        }
      } catch {}

      await loadData();
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId, loadData, applyFeedData]);

  const STALE_MS = 30_000; // 30 seconds

  const loadDataIfStale = useCallback(async () => {
    if (Date.now() - lastLoadedAt.current < STALE_MS) return;
    await loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), reloadRecent()]);
    setRefreshing(false);
  }, [loadData, reloadRecent]);

  const nudgeSlides = useMemo<NudgeSlide[]>(() => {
    const slides: NudgeSlide[] = [];
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
  }, [profileComplete, nudgeDismissed, hasListings, sellNudgeDismissed, dismissNudge, dismissSellNudge]);

  return {
    suggested,
    newArrivals,
    trending,
    priceDrops,
    preferredCategories,
    loading,
    refreshing,
    displayName,
    greeting: getGreeting(),
    nudgeSlides,
    showFitNudge: !fitSheetSeen,
    markFitSeen,
    onRefresh,
    loadDataIfStale,
    hasMounted,
  };
}
