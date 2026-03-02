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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useBasket } from '@/hooks/useBasket';
import { useStories } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NUDGE_DISMISSED_KEY = '@dukanoh/profile_nudge_dismissed';

async function fetchTrendingCategories(): Promise<string[]> {
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

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat]) => cat);
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
  return (data ?? []) as unknown as Listing[];
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

function SectionHeader({ title, onSeeAll, colors }: { title: string; onSeeAll: () => void; colors: ColorTokens }) {
  return (
    <View style={feedStaticStyles.sectionHeaderRow}>
      <Text style={[feedStaticStyles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
        <Text style={[feedStaticStyles.seeAll, { color: colors.primary }]}>See all</Text>
      </TouchableOpacity>
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
      color: colors.background,
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

function TrendingStrip({ categories, colors }: { categories: string[]; colors: ColorTokens }) {
  const styles = useMemo(() => getTrendingStyles(colors), [colors]);
  if (categories.length === 0) return null;
  return (
    <View style={feedStaticStyles.trendingRow}>
      <Text style={[feedStaticStyles.trendingLabel, { color: colors.textSecondary }]}>Trending</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={feedStaticStyles.trendingContent}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.pill]}
            onPress={() =>
              router.push({
                pathname: '/listings',
                params: { title: cat, categories: cat },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={[feedStaticStyles.trendingPillText, { color: colors.textPrimary }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function getTrendingStyles(colors: ColorTokens) {
  return StyleSheet.create({
    pill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surface,
    },
  });
}

// Static styles (layout/spacing only, no colors)
const feedStaticStyles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.subheading,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  seeAll: {
    ...Typography.body,
    fontFamily: 'Inter_600SemiBold',
  },
  gridRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  emptyCell: { flex: 1 },
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  trendingLabel: {
    ...Typography.caption,
    fontFamily: 'Inter_600SemiBold',
    marginRight: Spacing.sm,
  },
  trendingContent: { gap: Spacing.xs },
  trendingPillText: {
    ...Typography.caption,
    fontFamily: 'Inter_600SemiBold',
  },
});

export default function HomeScreen() {
  const { count } = useBasket();
  const { stories, loading: storiesLoading, markViewed } = useStories();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [suggested, setSuggested] = useState<Listing[]>([]);
  const [newArrivals, setNewArrivals] = useState<Listing[]>([]);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileComplete, setProfileComplete] = useState(true);
  const [nudgeDismissed, setNudgeDismissed] = useState(true);
  const [hasListings, setHasListings] = useState(true);
  const hasMounted = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(NUDGE_DISMISSED_KEY).then(val => {
      setNudgeDismissed(val === 'true');
    });
  }, []);

  const dismissNudge = useCallback(async () => {
    await AsyncStorage.setItem(NUDGE_DISMISSED_KEY, 'true');
    setNudgeDismissed(true);
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('preferred_categories, avatar_url, bio')
      .eq('id', user.id)
      .maybeSingle();

    const cats: string[] = profile?.preferred_categories ?? [];
    setPreferredCategories(cats);
    setProfileComplete(!!(profile?.avatar_url && profile?.bio));

    const [suggestedItems, newArrivalItems, trendingCats, listingCountResult] = await Promise.all([
      cats.length > 0 ? fetchSection(user.id, cats) : Promise.resolve([]),
      fetchSection(user.id, []),
      fetchTrendingCategories(),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id),
    ]);

    setSuggested(suggestedItems);
    setNewArrivals(newArrivalItems);
    setTrending(trendingCats);
    setHasListings((listingCountResult.count ?? 0) > 0);
  }, [user]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (hasMounted.current) {
        loadData();
      } else {
        hasMounted.current = true;
      }
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.searchBar}
              onPress={() => router.push('/(tabs)/search')}
              activeOpacity={0.8}
            >
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.placeholder}>Search for anything</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.basketButton}
              onPress={() => router.push('/basket')}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={24} color={colors.textPrimary} />
              {count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
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
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={styles.feedContent}
          >
            {!storiesLoading && stories.length > 0 && (
              <StoriesRow stories={stories} onView={markViewed} />
            )}

            {!profileComplete && !nudgeDismissed && (
              <ProfileNudgeCard onDismiss={dismissNudge} />
            )}

            <TrendingStrip categories={trending} colors={colors} />

            {suggested.length > 0 && (
              <View style={feedStaticStyles.section}>
                <SectionHeader
                  title="Suggested for you"
                  colors={colors}
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

            {newArrivals.length > 0 ? (
              <View style={feedStaticStyles.section}>
                <SectionHeader
                  title="New arrivals"
                  colors={colors}
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
      gap: Spacing.xs,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.base,
      height: 46,
    },
    placeholder: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    basketButton: { position: 'relative', padding: Spacing.xs },
    badge: {
      position: 'absolute',
      top: 0,
      right: 0,
      backgroundColor: colors.primary,
      borderRadius: BorderRadius.full,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: {
      color: colors.background,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      lineHeight: 12,
    },
    feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
  });
}
