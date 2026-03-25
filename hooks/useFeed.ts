import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// ── Keys & constants ────────────────────────────────────────────────
const nudgeKey = (uid: string) => `@dukanoh/profile_nudge_dismissed/${uid}`;
const sellNudgeKey = (uid: string) => `@dukanoh/sell_nudge_dismissed/${uid}`;
const FEED_CACHE_KEY = (uid: string) => `@dukanoh/feed_cache/${uid}`;
const RECENTLY_VIEWED_KEY = (uid: string) => `@dukanoh/recently_viewed/${uid}`;
const TRENDING_CACHE_KEY = '@dukanoh/trending_categories';
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
  onDismiss: () => void;
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

async function fetchTrendingCategories(): Promise<string[]> {
  try {
    const cached = await AsyncStorage.getItem(TRENDING_CACHE_KEY);
    if (cached) {
      const { categories, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TRENDING_TTL_MS) return categories;
    }
  } catch {}

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('listings')
    .select('category')
    .eq('status', 'available')
    .gte('created_at', since)
    .limit(200);

  if (!data || data.length === 0) return [];

  const counts = data.reduce<Record<string, number>>((acc, { category }) => {
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const categories = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat]) => cat);

  try {
    await AsyncStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ categories, timestamp: Date.now() }));
  } catch {}

  return categories;
}

async function fetchSection(userId: string, categories: string[]): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select('id, title, price, images, category, condition, size, created_at, seller_id, status, seller:users(username, avatar_url)')
    .eq('status', 'available')
    .neq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(6);

  if (categories.length > 0) query = query.in('category', categories);

  const { data } = await query;
  const listings = (data ?? []) as unknown as Listing[];
  if (listings.length === 0) return listings;

  const now = new Date().toISOString();
  const { data: boosts } = await supabase
    .from('boosts')
    .select('listing_id')
    .in('listing_id', listings.map(l => l.id))
    .gte('expires_at', now);

  const boostedIds = new Set((boosts ?? []).map(b => b.listing_id));
  return listings
    .map(l => ({ ...l, isBoosted: boostedIds.has(l.id) }))
    .sort((a, b) => (b.isBoosted ? 1 : 0) - (a.isBoosted ? 1 : 0));
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
  reloadRecent: () => void;
}

export function useFeed({ userId, reloadRecent }: UseFeedOptions) {
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
  const [hasListings, setHasListings] = useState(true);
  const hasMounted = useRef(false);
  const lastLoadedAt = useRef(0);

  // Load nudge dismissed state
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      AsyncStorage.getItem(nudgeKey(userId)),
      AsyncStorage.getItem(sellNudgeKey(userId)),
    ]).then(([profileVal, sellVal]) => {
      setNudgeDismissed(profileVal === 'true');
      setSellNudgeDismissed(sellVal === 'true');
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
      const [profile, viewedCats, savedCats, trendingCats] = await Promise.all([
        supabase
          .from('users')
          .select('preferred_categories, avatar_url, bio, full_name')
          .eq('id', userId)
          .maybeSingle()
          .then(r => r.data),
        getViewedCategories(userId),
        getSavedCategories(userId),
        fetchTrendingCategories(),
      ]);

      const onboardingCats: string[] = profile?.preferred_categories ?? [];
      const allCats = [...new Set([...onboardingCats, ...viewedCats, ...savedCats])];
      const isComplete = !!(profile?.avatar_url && profile?.bio);
      const rawName = profile?.full_name ?? '';
      const firstName = rawName === 'New User' ? '' : rawName.split(' ')[0];
      setDisplayName(firstName);

      const [suggestedItems, newArrivalItems, listingCountResult, savedPrices] = await Promise.all([
        allCats.length > 0 ? fetchSection(userId, allCats) : Promise.resolve([]),
        fetchSection(userId, []),
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

      const drops: PriceDrop[] = (savedPrices.data ?? [])
        .filter(s => {
          const l = s.listings as unknown as { price: number; status: string } | null;
          return l && l.price < (s.price_at_save as number) && l.status === 'available';
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
        });

      const feedData: Omit<FeedCache, 'timestamp'> = {
        suggested: suggestedItems,
        newArrivals: newArrivalItems,
        trending: trendingCats,
        priceDrops: drops,
        preferredCategories: allCats,
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
  }, [userId, applyFeedData]);

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
    onRefresh,
    loadDataIfStale,
    hasMounted,
  };
}
