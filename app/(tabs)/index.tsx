import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { StoriesRow } from '@/components/StoriesRow';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useBasket } from '@/hooks/useBasket';
import { useStories } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

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
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonImage} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%' }]} />
        <View style={[styles.skeletonLine, { width: '45%', height: 14 }]} />
      </View>
    </Animated.View>
  );
}

function SkeletonSection() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.skeletonLine, { width: 140, height: 16 }]} />
        <View style={[styles.skeletonLine, { width: 48, height: 14 }]} />
      </View>
      {[0, 1, 2].map(row => (
        <View key={row} style={styles.gridRow}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
        <Text style={styles.seeAll}>See all</Text>
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
        <View key={i} style={styles.gridRow}>
          {row.map(item => (
            <ListingCard
              key={item.id}
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          ))}
          {row.length === 1 && <View style={styles.emptyCell} />}
        </View>
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const { count } = useBasket();
  const { stories, loading: storiesLoading, markViewed } = useStories();
  const { user } = useAuth();

  const [suggested, setSuggested] = useState<Listing[]>([]);
  const [newArrivals, setNewArrivals] = useState<Listing[]>([]);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasMounted = useRef(false);

  const loadData = useCallback(async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('preferred_categories')
      .eq('id', user.id)
      .maybeSingle();

    const cats: string[] = profile?.preferred_categories ?? [];
    setPreferredCategories(cats);

    const [suggestedItems, newArrivalItems] = await Promise.all([
      cats.length > 0 ? fetchSection(user.id, cats) : Promise.resolve([]),
      fetchSection(user.id, []),
    ]);

    setSuggested(suggestedItems);
    setNewArrivals(newArrivalItems);
  }, [user]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // Silent refresh on focus — skip the very first focus (covered by useEffect above)
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
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.searchBar}
            onPress={() => router.push('/(tabs)/search')}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.placeholder}>Search for anything</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.basketButton}
            onPress={() => router.push('/basket')}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={24} color={Colors.textPrimary} />
            {count > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
              </View>
            )}
          </TouchableOpacity>
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
                tintColor={Colors.primary}
              />
            }
            contentContainerStyle={styles.feedContent}
          >
            {!storiesLoading && stories.length > 0 && (
              <StoriesRow stories={stories} onView={markViewed} />
            )}

            {suggested.length > 0 && (
              <View style={styles.section}>
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

            <View style={styles.section}>
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
          </ScrollView>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    height: 46,
  },
  placeholder: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  basketButton: { position: 'relative', padding: Spacing.xs },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.background,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
  feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
  section: { marginBottom: Spacing.xl },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.subheading,
    color: Colors.textPrimary,
  },
  seeAll: {
    ...Typography.body,
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  gridRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  emptyCell: { flex: 1 },
  // Skeleton
  skeletonCard: { flex: 1 },
  skeletonImage: {
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.surface,
  },
  skeletonContent: { paddingVertical: Spacing.sm, gap: 6 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    width: '85%',
  },
});
