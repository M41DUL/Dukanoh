import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { Radio } from '@/components/Radio';
import { Checkbox } from '@/components/Checkbox';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ─── Constants ──────────────────────────────────────────────

const PAGE_SIZE = 20;

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'most_saved' | 'most_viewed';
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  most_saved: 'Most saved',
  most_viewed: 'Most viewed',
};

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'];
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'];

interface PriceRange { label: string; min: number; max: number }
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under £25', min: 0, max: 25 },
  { label: '£25–£75', min: 25, max: 75 },
  { label: '£75–£150', min: 75, max: 150 },
  { label: '£150+', min: 150, max: Infinity },
];

// ─── Skeleton loading ───────────────────────────────────────

function SkeletonCard({ colors }: { colors: ColorTokens }) {
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
    <Animated.View style={[skeletonStyles.card, { opacity }]}>
      <View style={[skeletonStyles.image, { backgroundColor: colors.surface }]} />
      <View style={skeletonStyles.content}>
        <View style={[skeletonStyles.line, { backgroundColor: colors.surface }]} />
        <View style={[skeletonStyles.line, { backgroundColor: colors.surface, width: '60%' }]} />
        <View style={[skeletonStyles.line, { backgroundColor: colors.surface, width: '40%', height: 14 }]} />
      </View>
    </Animated.View>
  );
}

function SkeletonGrid({ colors }: { colors: ColorTokens }) {
  return (
    <View style={skeletonStyles.grid}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <SkeletonCard key={i} colors={colors} />
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  card: { width: '48.5%' },
  image: { aspectRatio: 4 / 5, borderRadius: BorderRadius.medium },
  content: { paddingVertical: Spacing.sm, gap: 6 },
  line: { height: 12, borderRadius: 6, width: '85%' },
});

// ─── Main screen ────────────────────────────────────────────

export default function ListingsScreen() {
  const { title = 'Listings', categories: categoriesParam, query: queryParam } = useLocalSearchParams<{
    title: string;
    categories?: string;
    query?: string;
  }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const categoriesStr = Array.isArray(categoriesParam) ? categoriesParam[0] : (categoriesParam ?? '');
  const categories = categoriesStr ? categoriesStr.split(',').filter(Boolean) : [];
  const searchQuery = Array.isArray(queryParam) ? queryParam[0] : (queryParam ?? '');

  // Listings state
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef(0);

  // Filter state
  const [sort, setSort] = useState<SortOption>('newest');
  const [activeSizes, setActiveSizes] = useState<string[]>([]);
  const [activeOccasions, setActiveOccasions] = useState<string[]>([]);
  const [activeConditions, setActiveConditions] = useState<string[]>([]);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Filter helpers
  const toggleSize = useCallback((size: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]);
  }, []);

  const toggleOccasion = useCallback((occ: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveOccasions(prev => prev.includes(occ) ? prev.filter(o => o !== occ) : [...prev, occ]);
  }, []);

  const toggleCondition = useCallback((cond: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveConditions(prev => prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]);
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveSizes([]);
    setActiveOccasions([]);
    setActiveConditions([]);
    setActivePriceRange(null);
    setSort('newest');
  }, []);

  const filterCount =
    activeSizes.length + activeOccasions.length + activeConditions.length + (activePriceRange ? 1 : 0);
  const isSorted = sort !== 'newest';
  const totalFilterCount = filterCount + (isSorted ? 1 : 0);

  const selectSort = useCallback((option: SortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSort(option);
  }, []);

  // ─── Build query ──────────────────────────────────────────
  const buildQuery = useCallback(() => {
    let orderCol = 'created_at';
    let ascending = false;
    if (sort === 'price_asc') { orderCol = 'price'; ascending = true; }
    else if (sort === 'price_desc') { orderCol = 'price'; ascending = false; }
    else if (sort === 'most_saved') { orderCol = 'save_count'; ascending = false; }
    else if (sort === 'most_viewed') { orderCol = 'view_count'; ascending = false; }

    let q = supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url)')
      .eq('status', 'available')
      .order(orderCol, { ascending });

    if (user) q = q.neq('seller_id', user.id);
    if (categories.length > 0) q = q.in('category', categories);

    if (activeSizes.length === 1) q = q.ilike('size', `%${activeSizes[0]}%`);
    if (activeOccasions.length === 1) q = q.eq('occasion', activeOccasions[0]);
    else if (activeOccasions.length > 1) q = q.in('occasion', activeOccasions);
    if (activeConditions.length === 1) q = q.eq('condition', activeConditions[0]);
    else if (activeConditions.length > 1) q = q.in('condition', activeConditions);

    if (activePriceRange) {
      q = q.gte('price', activePriceRange.min);
      if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
    }

    if (searchQuery.trim()) {
      const cleaned = searchQuery.trim().replace(/[,.()"'\\]/g, '');
      q = q.or(`title.ilike.%${cleaned}%,category.ilike.%${cleaned}%,occasion.ilike.%${cleaned}%`);
    }

    return q;
  }, [user, categoriesStr, searchQuery, sort, activeSizes, activeOccasions, activeConditions, activePriceRange]);

  // ─── Fetch ────────────────────────────────────────────────
  const load = useCallback(async (reset: boolean) => {
    const pageNum = reset ? 0 : pageRef.current;
    const q = buildQuery();

    const { data, error } = await q.range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
    if (error) return;

    let items = (data ?? []) as unknown as Listing[];

    // Client-side multi-size filter
    if (activeSizes.length > 1) {
      const sizeLower = activeSizes.map(s => s.toLowerCase());
      items = items.filter(l => l.size && sizeLower.some(s => l.size!.toLowerCase().includes(s)));
    }

    if (reset) {
      setListings(items);
      pageRef.current = 1;
    } else {
      setListings(prev => [...prev, ...items]);
      pageRef.current = pageNum + 1;
    }
    setHasMore((data ?? []).length === PAGE_SIZE);
  }, [buildQuery, activeSizes]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  // ─── Render ───────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity onPress={() => setShowFilterSheet(true)} hitSlop={8} style={styles.headerIconBtn}>
          <Ionicons name="options-outline" size={22} color={totalFilterCount > 0 ? colors.primary : colors.textPrimary} />
          {totalFilterCount > 0 && <View style={styles.filterBadge} />}
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <SkeletonGrid colors={colors} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              highlightTerm={searchQuery}
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              heading="No listings yet"
              subtext="Try adjusting your filters or check back later."
            />
          }
          ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
        />
      )}

      {/* ── Filter full-screen bottom sheet ────────────── */}
      <BottomSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        fullScreen
      >
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>Filter & Sort</Text>
          <TouchableOpacity onPress={() => setShowFilterSheet(false)} hitSlop={8} style={styles.filterCloseBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
          <Text style={styles.filterSectionLabel}>Sort by</Text>
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
            <Radio key={value} label={label} selected={sort === value} onPress={() => selectSort(value)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Size</Text>
          {SIZES.map(size => (
            <Checkbox key={size} label={size} checked={activeSizes.includes(size)} onPress={() => toggleSize(size)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Occasion</Text>
          {OCCASIONS.map(occ => (
            <Checkbox key={occ} label={occ} checked={activeOccasions.includes(occ)} onPress={() => toggleOccasion(occ)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Condition</Text>
          {CONDITIONS.map(cond => (
            <Checkbox key={cond} label={cond} checked={activeConditions.includes(cond)} onPress={() => toggleCondition(cond)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Price</Text>
          {PRICE_RANGES.map(range => (
            <Checkbox
              key={range.label}
              label={range.label}
              checked={activePriceRange?.label === range.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActivePriceRange(prev => prev?.label === range.label ? null : range);
              }}
            />
          ))}
        </ScrollView>

        <View style={[styles.filterFooter, { borderTopColor: colors.border }]}>
          <Button
            label={totalFilterCount > 0 ? `Reset (${totalFilterCount})` : 'Reset'}
            variant="outline"
            onPress={clearAllFilters}
            borderColor={colors.border}
            textColor={colors.textPrimary}
            style={styles.filterBtn}
          />
          <Button
            label="Apply"
            variant="primary"
            onPress={() => setShowFilterSheet(false)}
            style={styles.filterBtn}
          />
        </View>
      </BottomSheet>
    </ScreenWrapper>
  );
}

// ─── Styles ─────────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    backBtn: { padding: Spacing.xs },
    headerTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    headerIconBtn: {
      padding: Spacing.xs,
      position: 'relative',
    },
    filterBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },

    // Grid
    gridContent: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['4xl'] },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },

    // Filter sheet
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: Spacing.base,
    },
    filterTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    filterCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterScroll: { flex: 1 },
    filterScrollContent: { paddingBottom: Spacing['3xl'] },
    filterSectionLabel: {
      ...Typography.label,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginBottom: Spacing.sm,
      marginTop: Spacing.sm,
    },
    filterDivider: { marginVertical: Spacing.lg },
    filterFooter: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingTop: Spacing.base,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    filterBtn: { flex: 1 },
  });
}
