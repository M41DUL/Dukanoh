import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { ListingCard, Listing } from '@/components/ListingCard';
import { SectionHeader } from '@/components/SectionHeader';
import { SearchBar } from '@/components/SearchBar';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useStories, getAppStory } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const nudgeKey = (userId: string) => `@dukanoh/profile_nudge_dismissed/${userId}`;
const FEED_CACHE_KEY = (userId: string) => `@dukanoh/feed_cache/${userId}`;

const TRENDING_CACHE_KEY = '@dukanoh/trending_categories';
const TRENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RECENTLY_VIEWED_KEY = '@dukanoh/recently_viewed';

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

async function getViewedCategories(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
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
  // Check cache first
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

  // Cache the result
  try {
    await AsyncStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ categories, timestamp: Date.now() }));
  } catch {}

  return categories;
}

async function fetchSection(userId: string, categories: string[]): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select('*, seller:users(username, avatar_url)')
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

function SkeletonCard() {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[skeletonStaticStyles.card, { opacity }]}>
      <View style={[skeletonStaticStyles.image, { backgroundColor: colors.surface }]} />
      <View style={skeletonStaticStyles.content}>
        <View style={[skeletonStaticStyles.line, { backgroundColor: colors.surface }]} />
        <View style={[skeletonStaticStyles.line, { backgroundColor: colors.surface, width: '60%' }]} />
        <View style={[skeletonStaticStyles.line, { backgroundColor: colors.surface, width: '45%', height: 14 }]} />
      </View>
    </Animated.View>
  );
}

const skeletonStaticStyles = StyleSheet.create({
  card: { flex: 1 },
  image: { aspectRatio: 4 / 5, borderRadius: BorderRadius.medium },
  content: { paddingVertical: Spacing.sm, gap: 6 },
  line: { height: 12, borderRadius: 6, width: '85%' },
});

function SkeletonSection() {
  return (
    <View style={feedStaticStyles.section}>
      <View style={feedStaticStyles.sectionHeaderRow}>
        <View style={[skeletonStaticStyles.line, { width: 140, height: 16 }]} />
        <View style={[skeletonStaticStyles.line, { width: 48, height: 14 }]} />
      </View>
      {[0, 1, 2].map(row => (
        <View key={row} style={feedStaticStyles.gridRow}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}


function ListingsGrid({ items }: { items: Listing[] }) {
  const rows: Listing[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return (
    <View>
      {rows.map((row, i) => (
        <View key={i} style={feedStaticStyles.gridRow}>
          {row.map(item => (
            <ListingCard
              key={item.id}
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          ))}
          {row.length === 1 && <View style={feedStaticStyles.emptyCell} />}
        </View>
      ))}
    </View>
  );
}

function ReEngageCard() {
  const colors = useThemeColors();
  const styles = useMemo(() => getReEngageStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Ionicons name="shirt-outline" size={32} color={colors.textSecondary} />
      <Text style={styles.title}>Your wardrobe could earn money</Text>
      <Text style={styles.sub}>
        Turn items you no longer wear into cash — it only takes a few minutes.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.push('/(tabs)/sell')}
        activeOpacity={0.8}
      >
        <Text style={styles.btnText}>Start selling</Text>
      </TouchableOpacity>
    </View>
  );
}

function getReEngageStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.xl,
      marginTop: Spacing.md,
    },
    title: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    sub: {
      ...Typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    btn: {
      marginTop: Spacing.xs,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.primary,
    },
    btnText: {
      ...Typography.body,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
    },
  });
}

function ProfileNudgeCard({ onDismiss }: { onDismiss: () => void }) {
  const colors = useThemeColors();
  const styles = useMemo(() => getNudgeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/(tabs)/profile')}
      activeOpacity={0.8}
    >
      <View style={styles.avatar}>
        <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Complete your profile</Text>
        <Text style={styles.sub}>Add a photo and bio to stand out to buyers</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={10} style={styles.close}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function getNudgeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      marginBottom: Spacing.xl,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1, gap: 2 },
    title: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    sub: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    close: { padding: Spacing.xs },
  });
}

const CATEGORY_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Men: 'man-outline',
  Women: 'woman-outline',
  Casualwear: 'shirt-outline',
  Partywear: 'sparkles-outline',
  Festive: 'ribbon-outline',
  Formal: 'briefcase-outline',
  Achkan: 'person-outline',
  Wedding: 'heart-outline',
  'Pathani Suit': 'body-outline',
  Shoes: 'walk-outline',
};

function TrendingStrip({ categories, colors }: { categories: string[]; colors: ColorTokens }) {
  const styles = useMemo(() => getTrendingStyles(colors), [colors]);
  if (categories.length === 0) return null;
  return (
    <View style={feedStaticStyles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={styles.tile}
            onPress={() =>
              router.push({
                pathname: '/listings',
                params: { title: cat, categories: cat },
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name={CATEGORY_ICON[cat] ?? 'pricetag-outline'} size={20} color={colors.textPrimary} />
            <Text style={styles.label} numberOfLines={1}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function getTrendingStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: { marginHorizontal: -Spacing.base },
    row: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs, alignItems: 'center' },
    tile: {
      width: 110,
      height: 110,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    label: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}

interface PriceDrop {
  listingId: string;
  title: string;
  images: string[];
  currentPrice: number;
  savedPrice: number;
}

function PriceDropsRow({ drops, colors }: { drops: PriceDrop[]; colors: ColorTokens }) {
  const styles = useMemo(() => getPriceDropStyles(colors), [colors]);
  if (drops.length === 0) return null;
  return (
    <View style={feedStaticStyles.section}>
      <Text style={[feedStaticStyles.sectionTitle, { color: colors.textPrimary, marginBottom: Spacing.md }]}>
        Price drops
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {drops.map(drop => (
          <TouchableOpacity
            key={drop.listingId}
            style={styles.card}
            onPress={() => router.push(`/listing/${drop.listingId}`)}
            activeOpacity={0.8}
          >
            <Image source={{ uri: drop.images?.[0] }} style={styles.image} contentFit="cover" transition={200} />
            <Text style={styles.title} numberOfLines={1}>{drop.title}</Text>
            <Text style={styles.oldPrice}>£{drop.savedPrice.toFixed(2)}</Text>
            <Text style={styles.newPrice}>£{drop.currentPrice.toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function getPriceDropStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: { marginHorizontal: -Spacing.base },
    row: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs },
    card: { width: 110 },
    image: {
      width: 110,
      height: 140,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      marginBottom: Spacing.xs,
    },
    title: { ...Typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    oldPrice: {
      ...Typography.caption,
      color: colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    newPrice: { ...Typography.caption, color: '#22C55E', fontFamily: 'Inter_700Bold' },
  });
}

const feedStaticStyles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  sectionTitle: { ...Typography.label },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  gridRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  emptyCell: { flex: 1 },
});

export default function HomeScreen() {
  const { stories, loading: storiesLoading, markViewed } = useStories();
  const allStories = [getAppStory(), ...stories];
  const { user } = useAuth();
  const { items: recentItems, reload: reloadRecent } = useRecentlyViewed(user?.id);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [suggested, setSuggested] = useState<Listing[]>([]);
  const [newArrivals, setNewArrivals] = useState<Listing[]>([]);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  const [hasListings, setHasListings] = useState(true);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(nudgeKey(user.id)).then(val => {
      setNudgeDismissed(val === 'true');
    });
  }, [user]);

  const dismissNudge = useCallback(async () => {
    if (!user) return;
    await AsyncStorage.setItem(nudgeKey(user.id), 'true');
    setNudgeDismissed(true);
  }, []);

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
    if (!user) return;

    const [profile, viewedCats, savedCats] = await Promise.all([
      supabase
        .from('users')
        .select('preferred_categories, avatar_url, bio')
        .eq('id', user.id)
        .maybeSingle()
        .then(r => r.data),
      getViewedCategories(),
      getSavedCategories(user.id),
    ]);

    const onboardingCats: string[] = profile?.preferred_categories ?? [];
    // Merge all category signals — onboarding picks first, then viewed, then saved
    const allCats = [...new Set([...onboardingCats, ...viewedCats, ...savedCats])];
    const isComplete = !!(profile?.avatar_url && profile?.bio);

    const [suggestedItems, newArrivalItems, trendingCats, listingCountResult, savedPrices] = await Promise.all([
      allCats.length > 0 ? fetchSection(user.id, allCats) : Promise.resolve([]),
      fetchSection(user.id, []),
      fetchTrendingCategories(),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id),
      supabase
        .from('saved_items')
        .select('listing_id, price_at_save, listings(id, title, price, images, status)')
        .eq('user_id', user.id)
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

    // Persist cache for next visit
    try {
      await AsyncStorage.setItem(
        FEED_CACHE_KEY(user.id),
        JSON.stringify({ ...feedData, timestamp: Date.now() }),
      );
    } catch {}
  }, [user, applyFeedData]);

  // On mount: load cache instantly, then refresh from network
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FEED_CACHE_KEY(user.id));
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
  }, [user, loadData, applyFeedData]);

  useFocusEffect(
    useCallback(() => {
      if (hasMounted.current) {
        loadData();
        reloadRecent();
      } else {
        hasMounted.current = true;
      }
    }, [loadData, reloadRecent])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), reloadRecent()]);
    setRefreshing(false);
  }, [loadData, reloadRecent]);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onSubmit={(q) => {
              if (q.trim()) {
                router.push({ pathname: '/listings', params: { title: `"${q}"`, query: q } });
              }
            }}
          />
        </View>

        {loading ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.feedContent}>
            <SkeletonSection />
            <SkeletonSection />
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primaryText}
              />
            }
            contentContainerStyle={styles.feedContent}
          >
            {!storiesLoading && (
              <StoriesRow stories={allStories} onView={markViewed} />
            )}

            {!profileComplete && !nudgeDismissed && (
              <ProfileNudgeCard onDismiss={dismissNudge} />
            )}

            <PriceDropsRow drops={priceDrops} colors={colors} />

            {suggested.length > 0 && (
              <View style={feedStaticStyles.section}>
                <SectionHeader
                  title="Suggested for you"
                  onSeeAll={() =>
                    router.push({
                      pathname: '/listings',
                      params: {
                        title: 'Suggested for you',
                        categories: preferredCategories.join(','),
                      },
                    })
                  }
                />
                <ListingsGrid items={suggested} />
              </View>
            )}

            <TrendingStrip categories={trending} colors={colors} />

            {newArrivals.length > 0 ? (
              <View style={feedStaticStyles.section}>
                <SectionHeader
                  title="New arrivals"
                  onSeeAll={() =>
                    router.push({
                      pathname: '/listings',
                      params: { title: 'New arrivals' },
                    })
                  }
                />
                <ListingsGrid items={newArrivals} />
              </View>
            ) : suggested.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="shirt-outline" size={48} color={colors.textSecondary} />}
                heading="Nothing to browse yet"
                subtext="Be the first to list something and get the community started."
                ctaLabel="Start selling"
                onCta={() => router.push('/(tabs)/sell')}
              />
            ) : null}

            {!hasListings && <ReEngageCard />}

            {recentItems.length > 0 && (
              <View style={feedStaticStyles.section}>
                <SectionHeader title="Recently viewed" />
                <ListingsGrid items={recentItems} />
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { flex: 1 },
    topBar: {
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
  });
}
