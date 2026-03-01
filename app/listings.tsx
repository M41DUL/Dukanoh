import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type SortOption = 'newest' | 'price_asc' | 'price_desc';

const PAGE_SIZE = 16;

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
};

const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'] as const;

async function fetchPage(
  page: number,
  userId: string,
  categories: string[],
  sort: SortOption,
  condition: string | null,
): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select('*, seller:users(username, avatar_url)')
    .eq('status', 'available')
    .neq('seller_id', userId);

  if (categories.length > 0) query = query.in('category', categories);
  if (condition) query = query.eq('condition', condition);

  if (sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  return (data ?? []) as unknown as Listing[];
}

export default function ListingsScreen() {
  const { title = 'Listings', categories: categoriesParam } = useLocalSearchParams<{
    title: string;
    categories?: string;
  }>();
  const { user } = useAuth();

  const categoriesStr = Array.isArray(categoriesParam) ? categoriesParam[0] : (categoriesParam ?? '');
  const categories = categoriesStr ? categoriesStr.split(',').filter(Boolean) : [];

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState<SortOption>('newest');
  const [condition, setCondition] = useState<string | null>(null);
  const pageRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    if (!user) return;
    const pageNum = reset ? 0 : pageRef.current;
    const items = await fetchPage(pageNum, user.id, categories, sort, condition);
    if (reset) {
      setListings(items);
      pageRef.current = 1;
    } else {
      setListings(prev => [...prev, ...items]);
      pageRef.current = pageNum + 1;
    }
    setHasMore(items.length === PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, categoriesStr, sort, condition]);

  useEffect(() => {
    setLoading(true);
    load(true).finally(() => setLoading(false));
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, load]);

  const showSortSheet = () => {
    Alert.alert(
      'Sort by',
      undefined,
      [
        ...(['newest', 'price_asc', 'price_desc'] as SortOption[]).map(option => ({
          text: sort === option ? `✓  ${SORT_LABELS[option]}` : SORT_LABELS[option],
          onPress: () => setSort(option),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const showFilterSheet = () => {
    Alert.alert(
      'Filter by condition',
      undefined,
      [
        ...CONDITIONS.map(cond => ({
          text: condition === cond ? `✓  ${cond}` : cond,
          onPress: () => setCondition(prev => (prev === cond ? null : cond)),
        })),
        { text: condition ? 'Clear filter' : 'Cancel', style: 'cancel' as const, onPress: () => setCondition(null) },
      ],
    );
  };

  const isSorted = sort !== 'newest';
  const isFiltered = condition !== null;

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Sort + Filter controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlBtn, isSorted && styles.controlBtnActive]}
          onPress={showSortSheet}
          activeOpacity={0.8}
        >
          <Ionicons
            name="swap-vertical-outline"
            size={15}
            color={isSorted ? Colors.background : Colors.textPrimary}
          />
          <Text style={[styles.controlText, isSorted && styles.controlTextActive]}>Sort</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, isFiltered && styles.controlBtnActive]}
          onPress={showFilterSheet}
          activeOpacity={0.8}
        >
          <Ionicons
            name="options-outline"
            size={15}
            color={isFiltered ? Colors.background : Colors.textPrimary}
          />
          <Text style={[styles.controlText, isFiltered && styles.controlTextActive]}>
            {isFiltered ? condition : 'Filter'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={Colors.primary} style={styles.footerSpinner} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="shirt-outline" size={48} color={Colors.textSecondary} />}
              heading="No listings found"
              subtext="Try adjusting your sort or filter."
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  headerTitle: {
    ...Typography.subheading,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 32 },
  controls: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 42,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  controlBtnActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  controlText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  controlTextActive: {
    color: Colors.background,
  },
  loader: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  footerSpinner: { paddingVertical: Spacing.base },
});
