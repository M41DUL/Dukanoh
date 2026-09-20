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
import { useInfiniteQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Fuse from 'fuse.js';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { ScrollTabs } from '@/components/ScrollTabs';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { Radio } from '@/components/Radio';
import { Checkbox } from '@/components/Checkbox';
import {
  Typography,
  Spacing,
  BorderRadius,
  ColorTokens,
  Categories,
  Colours,
  Conditions,
  Fabrics,
  Occasions,
  Sizes
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { proRankSort } from '@/utils/proRankSort';
import { readSearchParams } from '@/lib/searchParams';
import { recordSearchEvent } from '@/lib/searchParseRemote';
import type { Gender } from '@/lib/searchParse';

// ─── Constants ──────────────────────────────────────────────

const PAGE_SIZE = 20;
const TEXT_SEARCH_LIMIT = 100;

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'most_saved' | 'most_viewed';
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  most_saved: 'Most saved',
  most_viewed: 'Most viewed',
};

const SIZES = [...Sizes];
const CONDITIONS = [...Conditions];
const OCCASIONS = [...Occasions];
const ALL_CATEGORIES = Categories.filter(c => c !== 'All');
const COLOURS = [...Colours];
const FABRICS = [...Fabrics];

interface PriceRange { label: string; min: number; max: number }
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under £25', min: 0, max: 25 },
  { label: '£25–£75', min: 25, max: 75 },
  { label: '£75–£150', min: 75, max: 150 },
  { label: '£150+', min: 150, max: Infinity },
];

/** A typed price ("under £150", "£50 to £100") as a filter chip. A preset with the same bounds is reused so it shows ticked. */
function priceRangeFromSearch(min: number | null, max: number | null): PriceRange | null {
  if (min === null && max === null) return null;
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  const preset = PRICE_RANGES.find(r => r.min === lo && r.max === hi);
  if (preset) return preset;
  const label = hi === Infinity ? `£${lo}+` : lo === 0 ? `Under £${hi}` : `£${lo}–£${hi}`;
  return { label, min: lo, max: hi };
}

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
  const params = useLocalSearchParams<{
    title: string;
    categories?: string;
    occasion?: string;
    query?: string;
    myListings?: string;
    // From a typed search (lib/searchParams): the words the dictionary and
    // Claude turned into filters, so the chips arrive lit.
    term?: string;
    colours?: string;
    occasions?: string;
    fabrics?: string;
    sizes?: string;
    conditions?: string;
    gender?: string;
    priceMin?: string;
    priceMax?: string;
    src?: string;
  }>();
  const {
    title = 'Listings',
    categories: categoriesParam,
    occasion: occasionParam,
    query: queryParam,
    myListings: myListingsParam,
  } = params;
  // Read once: it seeds the filter state and must not re-seed on re-render.
  const [incoming] = useState(() => readSearchParams(params));
  const fromSearch = incoming.source !== null;
  const myListings = myListingsParam === 'true';
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const categoriesStr = Array.isArray(categoriesParam) ? categoriesParam[0] : (categoriesParam ?? '');
  const categories = categoriesStr ? categoriesStr.split(',').filter(Boolean) : [];
  const searchQuery = Array.isArray(queryParam) ? queryParam[0] : (queryParam ?? '');
  const occasionPreset = Array.isArray(occasionParam) ? occasionParam[0] : (occasionParam ?? '');

  // Sub-tabs: occasions when browsing a single category, categories when browsing an occasion
  const subTabs = useMemo(() => {
    if (fromSearch) return [];
    if (categories.length === 1 && !occasionPreset && !searchQuery) return ['All', ...OCCASIONS];
    if (occasionPreset && categories.length === 0) return ['All', ...ALL_CATEGORIES];
    return [];
  }, [categories.length, occasionPreset, searchQuery, fromSearch]);

  const [activeSubTab, setActiveSubTab] = useState('All');

  // Filter state
  const [sort, setSort] = useState<SortOption>('newest');
  const [activeSizes, setActiveSizes] = useState<string[]>(incoming.sizes);
  const [activeOccasions, setActiveOccasions] = useState<string[]>(
    occasionPreset ? [occasionPreset] : incoming.occasions
  );
  const [activeConditions, setActiveConditions] = useState<string[]>(incoming.conditions);
  const [activeColours, setActiveColours] = useState<string[]>(incoming.colours);
  const [activeFabrics, setActiveFabrics] = useState<string[]>(incoming.fabrics);
  const [activeGender, setActiveGender] = useState<Gender | null>(incoming.gender);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(
    () => priceRangeFromSearch(incoming.priceMin, incoming.priceMax)
  );
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

  const toggleColour = useCallback((col: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveColours(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  }, []);

  const toggleFabric = useCallback((fab: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFabrics(prev => prev.includes(fab) ? prev.filter(f => f !== fab) : [...prev, fab]);
  }, []);

  const toggleGender = useCallback((g: Gender) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveGender(prev => (prev === g ? null : g));
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveGender(null);
    setActiveSizes([]);
    setActiveOccasions(occasionPreset ? [occasionPreset] : []);
    setActiveConditions([]);
    setActiveColours([]);
    setActiveFabrics([]);
    setActivePriceRange(null);
    setSort('newest');
  }, [occasionPreset]);

  const filterCount =
    (activeGender ? 1 : 0) +
    activeSizes.length +
    (activeOccasions.length - (occasionPreset && activeOccasions.includes(occasionPreset) ? 1 : 0)) +
    activeConditions.length +
    activeColours.length +
    activeFabrics.length +
    (activePriceRange ? 1 : 0);
  const isSorted = sort !== 'newest';
  const totalFilterCount = filterCount + (isSorted ? 1 : 0);

  const selectSort = useCallback((option: SortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSort(option);
  }, []);

  // ─── Fetch ────────────────────────────────────────────────
  const trimmedQuery = searchQuery.trim().replace(/[,.()"'\\%_]/g, '');
  const isTextSearch = !!trimmedQuery;
  const searchWords = trimmedQuery.split(/\s+/).filter(Boolean).slice(0, 6);

  const query = useInfiniteQuery({
    queryKey: queryKeys.listings.search({
      term: trimmedQuery,
      categories,
      occasion: occasionPreset,
      gender: activeGender,
      sort,
      subTab: activeSubTab,
      sizes: activeSizes,
      occasions: activeOccasions,
      conditions: activeConditions,
      colours: activeColours,
      fabrics: activeFabrics,
      priceMin: activePriceRange?.min ?? null,
      priceMax: activePriceRange && activePriceRange.max !== Infinity ? activePriceRange.max : null,
      myListings,
      userId: user?.id,
      blockedIds,
    }),
    queryFn: async ({ pageParam, signal }) => {
      const limit = isTextSearch ? TEXT_SEARCH_LIMIT : PAGE_SIZE;
      const from = pageParam * limit;
      const to = from + limit - 1;

      let orderCol = 'published_at';
      let ascending = false;
      if (sort === 'price_asc') { orderCol = 'price'; ascending = true; }
      else if (sort === 'price_desc') { orderCol = 'price'; ascending = false; }
      else if (sort === 'most_saved') { orderCol = 'save_count'; ascending = false; }
      else if (sort === 'most_viewed') { orderCol = 'view_count'; ascending = false; }

      let q = supabase
        .from('listings')
        .select('id, title, price, original_price, price_dropped_at, images, status, category, condition, size, occasion, colour, fabric, save_count, published_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified, tax_hold, selling_paused)')
        .order(orderCol, { ascending });

      if (!myListings) q = q.eq('status', 'available');

      if (myListings) {
        if (user) q = q.eq('seller_id', user.id);
      } else {
        if (user) q = q.neq('seller_id', user.id);
        if (blockedIds.length > 0) q = q.not('seller_id', 'in', `(${blockedIds.join(',')})`);
      }
      if (categories.length > 0) q = q.in('category', categories);

      // Sub-tab filter
      if (activeSubTab !== 'All') {
        if (categories.length === 1) {
          q = q.eq('occasion', activeSubTab);
        } else if (occasionPreset) {
          q = q.eq('category', activeSubTab);
        }
      }

      if (activeSizes.length === 1) q = q.ilike('size', `%${activeSizes[0]}%`);
      if (activeOccasions.length === 1) q = q.eq('occasion', activeOccasions[0]);
      else if (activeOccasions.length > 1) q = q.in('occasion', activeOccasions);
      if (activeConditions.length === 1) q = q.eq('condition', activeConditions[0]);
      else if (activeConditions.length > 1) q = q.in('condition', activeConditions);
      if (activeColours.length === 1) q = q.eq('colour', activeColours[0]);
      else if (activeColours.length > 1) q = q.in('colour', activeColours);
      if (activeFabrics.length === 1) q = q.eq('fabric', activeFabrics[0]);
      else if (activeFabrics.length > 1) q = q.in('fabric', activeFabrics);
      if (activeGender) q = q.eq('gender', activeGender);

      if (activePriceRange) {
        q = q.gte('price', activePriceRange.min);
        if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
      }

      // Every leftover word must appear somewhere on the listing, so
      // "banarasi silk" finds "silk banarasi saree".
      for (const word of searchWords) {
        q = q.or(`title.ilike.%${word}%,description.ilike.%${word}%,category.ilike.%${word}%,occasion.ilike.%${word}%,colour.ilike.%${word}%,fabric.ilike.%${word}%`);
      }

      const { data, error } = await q.range(from, to).abortSignal(signal);
      if (error) throw error;

      const rawData = ((data ?? []) as Listing[]).filter(
        l => !myListings && (l.seller?.tax_hold || l.seller?.selling_paused) ? false : true
      );

      // Client-side multi-size filter
      let filtered = rawData;
      if (activeSizes.length > 1) {
        const sizeLower = activeSizes.map(s => s.toLowerCase());
        filtered = filtered.filter(l =>
          l.size && sizeLower.some(s => l.size?.toLowerCase().includes(s))
        );
      }

      // Fuzzy re-rank for text searches
      if (trimmedQuery && filtered.length > 0) {
        const fuse = new Fuse(filtered, {
          keys: [
            { name: 'title', weight: 0.55 },
            { name: 'category', weight: 0.15 },
            { name: 'occasion', weight: 0.10 },
            { name: 'colour', weight: 0.10 },
            { name: 'fabric', weight: 0.10 },
          ],
          threshold: 0.4,
          includeScore: true,
        });
        filtered = fuse.search(trimmedQuery).map(r => r.item);
      }

      // Pro ranking only on non-text search; text search respects relevance.
      const items = isTextSearch ? filtered : proRankSort(filtered);
      const hasMore = !isTextSearch && (data?.length ?? 0) === PAGE_SIZE;

      return {
        data: items,
        nextCursor: hasMore ? pageParam + 1 : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap(p => p.data) ?? [],
    [query.data],
  );

  const onEndReached = useCallback(() => {
    if (isTextSearch) return;
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  }, [isTextSearch, query]);

  // One search log row per typed search, once the first page has landed.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!fromSearch || recordedRef.current || query.isLoading || query.isError || !query.data) return;
    recordedRef.current = true;
    const { term, source, ...parse } = incoming;
    recordSearchEvent({ term, parse, source: source ?? 'rules', resultCount: items.length });
  }, [fromSearch, incoming, items.length, query.data, query.isError, query.isLoading]);

  // ─── Render ───────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <Header
        title={title}
        showBack
        rightAction={
          <TouchableOpacity onPress={() => setShowFilterSheet(true)} hitSlop={8} style={styles.headerIconBtn}>
            <Ionicons name="options-outline" size={22} color={totalFilterCount > 0 ? colors.primary : colors.textPrimary} />
            {totalFilterCount > 0 && <View style={styles.filterBadge} />}
          </TouchableOpacity>
        }
      />

      {/* Sub-tabs */}
      {subTabs.length > 0 && (
        <ScrollTabs tabs={subTabs} activeTab={activeSubTab ?? subTabs[0]} onTabChange={setActiveSubTab} />
      )}

      {query.isLoading ? (
        <SkeletonGrid colors={colors} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.primary} />
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
            query.isError
              ? <EmptyState
                  heading="Something went wrong"
                  subtext="Check your connection and try again."
                  ctaLabel="Retry"
                  onCta={() => query.refetch()}
                />
              : (fromSearch || isTextSearch)
                ? <EmptyState
                    heading={`Nothing for ${title} yet`}
                    subtext="Try fewer filters or another word."
                    ctaLabel={totalFilterCount > 0 ? 'Clear filters' : undefined}
                    onCta={totalFilterCount > 0 ? clearAllFilters : undefined}
                  />
                : <EmptyState
                    heading="No listings yet"
                    subtext={categories.length === 1
                      ? `Be the first to list a ${categories[0]}!`
                      : 'Try adjusting your filters or check back later.'}
                    ctaLabel={categories.length === 1 ? 'Start selling' : undefined}
                    onCta={categories.length === 1 ? () => router.push('/(tabs)/sell') : undefined}
                  />
          }
          ListFooterComponent={query.isFetchingNextPage ? <LoadingSpinner /> : null}
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

          <Text style={styles.filterSectionLabel}>For</Text>
          {(['Women', 'Men'] as Gender[]).map(g => (
            <Checkbox key={g} label={g} checked={activeGender === g} onPress={() => toggleGender(g)} />
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

          <Text style={styles.filterSectionLabel}>Colour</Text>
          {COLOURS.map(col => (
            <Checkbox key={col} label={col} checked={activeColours.includes(col)} onPress={() => toggleColour(col)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Fabric</Text>
          {FABRICS.map(fab => (
            <Checkbox key={fab} label={fab} checked={activeFabrics.includes(fab)} onPress={() => toggleFabric(fab)} />
          ))}

          <Divider style={styles.filterDivider} />

          <Text style={styles.filterSectionLabel}>Price</Text>
          {activePriceRange && !PRICE_RANGES.some(r => r.label === activePriceRange.label) && (
            <Checkbox label={activePriceRange.label} checked onPress={() => setActivePriceRange(null)} />
          )}
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
            onPress={() => {
              setActiveSubTab('All');
              setShowFilterSheet(false);
            }}
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
      marginHorizontal: -Spacing.xl,
      paddingHorizontal: Spacing.xl,
    },
    filterBtn: { flex: 1 },
  });
}
