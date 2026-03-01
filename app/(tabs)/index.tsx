import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useBasket } from '@/hooks/useBasket';
import { useStories } from '@/hooks/useStories';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 16;

async function fetchPage(page: number): Promise<Listing[]> {
  const { data } = await supabase
    .from('listings')
    .select('*, seller:users(username, avatar_url)')
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
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
        <View style={[styles.skeletonLine, styles.skeletonPrice]} />
      </View>
    </Animated.View>
  );
}

function SkeletonGrid() {
  return (
    <View style={styles.skeletonWrapper}>
      {[0, 1, 2].map(row => (
        <View key={row} style={styles.row}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const { count } = useBasket();
  const { stories, loading: storiesLoading, markViewed } = useStories();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    const pageNum = reset ? 0 : pageRef.current;
    const items = await fetchPage(pageNum);
    if (reset) {
      setListings(items);
      pageRef.current = 1;
    } else {
      setListings(prev => [...prev, ...items]);
      pageRef.current = pageNum + 1;
    }
    setHasMore(items.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    load(true).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, load]);

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
          <SkeletonGrid />
        ) : (
          <FlatList
            data={listings}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            )}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              !storiesLoading && stories.length > 0 ? (
                <StoriesRow stories={stories} onView={markViewed} />
              ) : null
            }
            contentContainerStyle={styles.feedContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.primary}
              />
            }
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.primary}
                  style={styles.footerSpinner}
                />
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                icon={<Ionicons name="shirt-outline" size={48} color={Colors.textSecondary} />}
                heading="Your feed is empty"
                subtext="New listings will appear here once sellers start posting."
              />
            }
          />
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
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  footerSpinner: { paddingVertical: Spacing.base },
  // Skeleton
  skeletonWrapper: { paddingTop: Spacing.sm },
  skeletonCard: { flex: 1 },
  skeletonImage: {
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.surface,
  },
  skeletonContent: {
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    width: '85%',
  },
  skeletonPrice: {
    width: '45%',
    height: 14,
    marginTop: 2,
  },
});
