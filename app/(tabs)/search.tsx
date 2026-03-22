import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Animated,
  RefreshControl,
  Platform,
  UIManager,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar } from '@/components/SearchBar';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { Badge } from '@/components/Badge';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import {
  Typography,
  Spacing,
  BorderRadius,
  ColorTokens,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ─── Constants ──────────────────────────────────────────────

const PAGE_SIZE = 20;
const TEXT_SEARCH_LIMIT = 100;
const HERO_BANNER_1 = require('@/assets/images/hero-banner-1.png');
const HERO_BANNER_2 = require('@/assets/images/hero-banner-2.png');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TRANSITION = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'];

// ─── Tab system ─────────────────────────────────────────────

type BrowseTab = 'Women' | 'Men' | 'All';
const BROWSE_TABS: BrowseTab[] = ['Women', 'Men', 'All'];

const TAB_CONFIG: Record<BrowseTab, { categories: string[]; occasions: string[] }> = {
  Women: {
    categories: ['Lehenga', 'Saree', 'Anarkali', 'Kurta', 'Casualwear', 'Shoes'],
    occasions: ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'],
  },
  Men: {
    categories: ['Sherwani', 'Kurta', 'Achkan', 'Pathani Suit', 'Casualwear', 'Shoes'],
    occasions: ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'],
  },
  All: {
    categories: ['Lehenga', 'Saree', 'Sherwani', 'Anarkali', 'Kurta', 'Achkan', 'Pathani Suit', 'Casualwear', 'Shoes'],
    occasions: OCCASIONS,
  },
};

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'];

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'most_saved' | 'most_viewed';
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  most_saved: 'Most saved',
  most_viewed: 'Most viewed',
};

interface PriceRange { label: string; min: number; max: number }
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under £25', min: 0, max: 25 },
  { label: '£25\u2013£75', min: 25, max: 75 },
  { label: '£75\u2013£150', min: 75, max: 150 },
  { label: '£150+', min: 150, max: Infinity },
];

// ─── Browse row component ───────────────────────────────────

function BrowseRow({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ColorTokens;
}) {
  return (
    <TouchableOpacity
      style={browseRowStyles.row}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[browseRowStyles.label, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const browseRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: (Spacing.md + 2) * 2,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});

// ─── Hero banner component ──────────────────────────────────

function HeroBanner({ source, onPress }: { source: number; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={heroBannerStyles.container}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <Image
        source={source}
        style={heroBannerStyles.image}
        contentFit="cover"
        transition={300}
      />
    </TouchableOpacity>
  );
}

const heroBannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    height: 180,
    marginVertical: Spacing.base,
  },
  image: {
    flex: 1,
  },
});

// ─── Skeleton loading for results ────────────────────────────

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
  card: {
    width: '48.5%',
  },
  image: {
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.medium,
  },
  content: {
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  line: {
    height: 12,
    borderRadius: 6,
    width: '85%',
  },
});

// ─── Main screen ────────────────────────────────────────────

export default function SearchScreen() {
  // Search state
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<BrowseTab>('Women');
  const tabFade = useRef(new Animated.Value(1)).current;
  const { saveSearch } = useSearchHistory();
  const { user } = useAuth();

  // Set default tab from user's onboarding preferences
  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('preferred_categories')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const cats: string[] = data?.preferred_categories ?? [];
        if (cats.includes('Men') && !cats.includes('Women')) setActiveTab('Men');
        else if (cats.includes('Women')) setActiveTab('Women');
        else setActiveTab('All');
      });
  }, [user]);

  // Results state
  const [resultsMode, setResultsMode] = useState(false);
  const [resultsTitle, setResultsTitle] = useState('');
  const [resultsCategory, setResultsCategory] = useState<string | null>(null);
  const [resultsOccasionPreset, setResultsOccasionPreset] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState('All');

  // Sub-tabs: show occasions when browsing a category, categories when browsing an occasion
  const subTabs = useMemo(() => {
    if (!resultsMode) return [];
    if (resultsCategory) return ['All', ...OCCASIONS];
    if (resultsOccasionPreset) {
      const allCats = TAB_CONFIG.All.categories;
      return ['All', ...allCats];
    }
    return [];
  }, [resultsMode, resultsCategory, resultsOccasionPreset]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [activeSizes, setActiveSizes] = useState<string[]>([]);
  const [activeOccasions, setActiveOccasions] = useState<string[]>([]);
  const [activeConditions, setActiveConditions] = useState<string[]>([]);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(null);
  const [sort, setSort] = useState<SortOption>('newest');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

  // Pagination state
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ─── Navigation into results ────────────────────────────
  const openCategory = useCallback((cat: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setResultsMode(true);
    setResultsTitle(cat);
    setResultsCategory(cat);
    setResultsOccasionPreset(null);
    setActiveSubTab('All');
  }, []);

  const openOccasion = useCallback((occ: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setResultsMode(true);
    setResultsTitle(occ);
    setResultsCategory(null);
    setResultsOccasionPreset(occ);
    setActiveOccasions([occ]);
    setActiveSubTab('All');
  }, []);

  const openSearch = useCallback((term: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setQuery(term);
    setResultsMode(true);
    setResultsTitle(`\u201C${term}\u201D`);
    setResultsCategory(null);
    setResultsOccasionPreset(null);
    saveSearch(term);
  }, [saveSearch]);

  const exitResults = useCallback(() => {
    LayoutAnimation.configureNext(TRANSITION);
    setResultsMode(false);
    setResultsCategory(null);
    setResultsOccasionPreset(null);
    setQuery('');
    setActiveSizes([]);
    setActiveOccasions([]);
    setActiveConditions([]);
    setActivePriceRange(null);
    setSort('newest');
    setPage(0);
    setHasMore(true);
  }, []);

  // ─── Filter helpers ─────────────────────────────────────
  const toggleSize = useCallback((size: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  }, []);

  const toggleOccasion = useCallback((occ: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveOccasions(prev =>
      prev.includes(occ) ? prev.filter(o => o !== occ) : [...prev, occ]
    );
  }, []);

  const toggleCondition = useCallback((cond: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveConditions(prev =>
      prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]
    );
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveSizes([]);
    setActiveOccasions(resultsOccasionPreset ? [resultsOccasionPreset] : []);
    setActiveConditions([]);
    setActivePriceRange(null);
  }, [resultsOccasionPreset]);

  const filterCount =
    activeSizes.length +
    // Don't count the preset occasion as a user-applied filter
    (activeOccasions.length - (resultsOccasionPreset && activeOccasions.includes(resultsOccasionPreset) ? 1 : 0)) +
    activeConditions.length +
    (activePriceRange ? 1 : 0);
  const isSorted = sort !== 'newest';

  const selectSort = useCallback((option: SortOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSort(option);
    setShowSortSheet(false);
  }, []);

  // ─── Build query (shared between initial fetch and load-more) ──
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

    if (resultsCategory) q = q.eq('category', resultsCategory);

    // Sub-tab filter: occasion when browsing category, category when browsing occasion
    if (activeSubTab !== 'All') {
      if (resultsCategory) {
        q = q.eq('occasion', activeSubTab);
      } else if (resultsOccasionPreset) {
        q = q.eq('category', activeSubTab);
      }
    }

    if (activeSizes.length === 1) {
      q = q.ilike('size', `%${activeSizes[0]}%`);
    }

    if (activeOccasions.length === 1) {
      q = q.eq('occasion', activeOccasions[0]);
    } else if (activeOccasions.length > 1) {
      q = q.in('occasion', activeOccasions);
    }

    if (activeConditions.length === 1) {
      q = q.eq('condition', activeConditions[0]);
    } else if (activeConditions.length > 1) {
      q = q.in('condition', activeConditions);
    }

    if (activePriceRange) {
      q = q.gte('price', activePriceRange.min);
      if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
    }

    const trimmedQuery = query.trim().replace(/[,.()"'\\]/g, '');
    if (trimmedQuery) {
      q = q.or(`title.ilike.%${trimmedQuery}%,category.ilike.%${trimmedQuery}%,occasion.ilike.%${trimmedQuery}%`);
    }

    return { q, trimmedQuery };
  }, [query, resultsCategory, resultsOccasionPreset, activeSubTab, activeSizes, activeOccasions, activeConditions, activePriceRange, sort]);

  const applyClientFilters = useCallback((data: Listing[], trimmedQuery: string) => {
    let results = data;

    // Client-side multi-size filter
    if (activeSizes.length > 1) {
      const sizeLower = activeSizes.map(s => s.toLowerCase());
      results = results.filter(l =>
        l.size && sizeLower.some(s => l.size!.toLowerCase().includes(s))
      );
    }

    // Fuzzy re-rank
    if (trimmedQuery && results.length > 0) {
      const fuse = new Fuse(results, {
        keys: [
          { name: 'title', weight: 0.6 },
          { name: 'category', weight: 0.2 },
          { name: 'occasion', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
      });
      results = fuse.search(trimmedQuery).map(r => r.item);
    }

    return results;
  }, [activeSizes]);

  // ─── Fetch results (initial page) ─────────────────────────
  useEffect(() => {
    if (!resultsMode) return;

    const abortController = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setFetchError(false);
      setPage(0);
      setHasMore(true);

      const { q, trimmedQuery } = buildQuery();

      const isTextSearch = !!trimmedQuery;
      const limit = isTextSearch ? TEXT_SEARCH_LIMIT : PAGE_SIZE;
      const { data, error } = await q
        .range(0, limit - 1)
        .abortSignal(abortController.signal);

      if (abortController.signal.aborted) return;
      if (error) {
        setFetchError(true);
        setLoading(false);
        return;
      }

      const results = applyClientFilters((data ?? []) as unknown as Listing[], trimmedQuery);

      setListings(results);
      setHasMore(!isTextSearch && (data ?? []).length === PAGE_SIZE);
      setLoading(false);
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [resultsMode, buildQuery, applyClientFilters, retryKey]);

  // ─── Load more (next page) ────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;

    const trimmedQuery = query.trim().replace(/[,.()"'\\]/g, '');
    if (trimmedQuery) return; // Text searches don't paginate

    setLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;

    const { q } = buildQuery();
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);

    if (error) {
      setLoadingMore(false);
      return;
    }

    const newItems = (data ?? []) as unknown as Listing[];

    // Client-side multi-size filter on new page
    let filtered = newItems;
    if (activeSizes.length > 1) {
      const sizeLower = activeSizes.map(s => s.toLowerCase());
      filtered = filtered.filter(l =>
        l.size && sizeLower.some(s => l.size!.toLowerCase().includes(s))
      );
    }

    setListings(prev => [...prev, ...filtered]);
    setPage(nextPage);
    setHasMore(newItems.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, loading, page, query, buildQuery, activeSizes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRetryKey(k => k + 1);
    // refreshing flag is cleared when the fetch effect finishes
  }, []);

  // Clear refreshing when loading finishes
  useEffect(() => {
    if (!loading && refreshing) setRefreshing(false);
  }, [loading, refreshing]);


  // ─── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <View style={styles.searchBarWrapper}>
        {resultsMode ? (
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={exitResults} hitSlop={8} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.resultsHeaderTitle} numberOfLines={1}>{resultsTitle}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setShowSortSheet(true)} hitSlop={8} style={styles.headerIconBtn}>
                <Ionicons name="swap-vertical-outline" size={20} color={isSorted ? colors.primary : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilterSheet(true)} hitSlop={8} style={styles.headerIconBtn}>
                <Ionicons name="options-outline" size={20} color={filterCount > 0 ? colors.primary : colors.textPrimary} />
                {filterCount > 0 && <View style={styles.filterBadge} />}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <SearchBar
            value={query}
            onChangeText={setQuery}
            showHistory
            onFocusChange={setSearchFocused}
            onSubmit={(term) => {
              if (term.trim()) openSearch(term);
            }}
          />
        )}
      </View>

      {/* ── Tab bar + Browse directory ────────────────────── */}
      {!resultsMode && !searchFocused && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.browseContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={styles.browseScroll}>
            <Text style={styles.shopHeading}>Shop</Text>
            <View style={styles.tabBar}>
              {BROWSE_TABS.map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => {
                    if (tab === activeTab) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Animated.timing(tabFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
                      setActiveTab(tab);
                      Animated.timing(tabFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Animated.View style={{ opacity: tabFade }}>
              {TAB_CONFIG[activeTab].categories.map((cat, i) => (
                <React.Fragment key={cat}>
                  <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
                  {i < TAB_CONFIG[activeTab].categories.length - 1 && <Divider style={styles.rowDivider} />}
                </React.Fragment>
              ))}

              <HeroBanner
                source={activeTab === 'Men' ? HERO_BANNER_2 : HERO_BANNER_1}
                onPress={() => openCategory(activeTab === 'All' ? 'Women' : activeTab)}
              />

              {TAB_CONFIG[activeTab].occasions.map((occ, i) => (
                <React.Fragment key={occ}>
                  <BrowseRow label={occ} onPress={() => openOccasion(occ)} colors={colors} />
                  {i < TAB_CONFIG[activeTab].occasions.length - 1 && <Divider style={styles.rowDivider} />}
                </React.Fragment>
              ))}

              <HeroBanner
                source={activeTab === 'Men' ? HERO_BANNER_1 : HERO_BANNER_2}
                onPress={() => openOccasion('Wedding')}
              />
            </Animated.View>
          </ScrollView>
      )}

      {/* ── Results view ─────────────────────────────────── */}
      {resultsMode && (
        <>
          {/* Sub-category tabs */}
          {subTabs.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subTabRow}
              style={styles.subTabScroll}
            >
              {subTabs.map(tab => {
                const isActive = activeSubTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.subTab, isActive && styles.subTabActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveSubTab(tab);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.subTabLabel, isActive && styles.subTabLabelActive]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

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
              keyboardShouldPersistTaps="handled"
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                />
              }
              renderItem={({ item }) => (
                <ListingCard
                  listing={item}
                  variant="grid"
                  highlightTerm={query.trim()}
                  onPress={() => router.push(`/listing/${item.id}`)}
                />
              )}
              ListHeaderComponent={
                <Text style={styles.resultsCount}>
                  {listings.length} {listings.length === 1 ? 'result' : 'results'}
                  {resultsTitle ? ` for ${resultsTitle}` : ''}
                </Text>
              }
              ListEmptyComponent={
                fetchError
                  ? <EmptyState
                      heading="Something went wrong"
                      subtext="Check your connection and try again."
                      ctaLabel="Retry"
                      onCta={() => setRetryKey(k => k + 1)}
                    />
                  : <EmptyState
                      heading="No listings yet"
                      subtext={resultsCategory
                        ? `Be the first to list a ${resultsCategory}!`
                        : 'Try adjusting your filters or search term.'}
                      ctaLabel={resultsCategory ? 'Start selling' : undefined}
                      onCta={resultsCategory ? () => router.push('/(tabs)/sell') : undefined}
                    />
              }
              ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
            />
          )}
        </>
      )}

      {/* ── Filter bottom sheet ──────────────────────────── */}
      <BottomSheet visible={showFilterSheet} onClose={() => setShowFilterSheet(false)}>
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            {filterCount > 0 && (
              <TouchableOpacity onPress={clearAllFilters} hitSlop={8}>
                <Text style={styles.clearLink}>Clear all</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.sheetSectionLabel}>Size</Text>
          <View style={styles.sheetChips}>
            {SIZES.map(size => (
              <Badge
                key={size}
                label={size}
                active={activeSizes.includes(size)}
                onPress={() => toggleSize(size)}
              />
            ))}
          </View>

          <Text style={styles.sheetSectionLabel}>Occasion</Text>
          <View style={styles.sheetChips}>
            {OCCASIONS.map(occ => (
              <Badge
                key={occ}
                label={occ}
                active={activeOccasions.includes(occ)}
                onPress={() => toggleOccasion(occ)}
              />
            ))}
          </View>

          <Text style={styles.sheetSectionLabel}>Condition</Text>
          <View style={styles.sheetChips}>
            {CONDITIONS.map(cond => (
              <Badge
                key={cond}
                label={cond}
                active={activeConditions.includes(cond)}
                onPress={() => toggleCondition(cond)}
              />
            ))}
          </View>

          <Text style={styles.sheetSectionLabel}>Price</Text>
          <View style={styles.sheetChips}>
            {PRICE_RANGES.map(range => (
              <Badge
                key={range.label}
                label={range.label}
                active={activePriceRange?.label === range.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActivePriceRange(prev =>
                    prev?.label === range.label ? null : range
                  );
                }}
              />
            ))}
          </View>

          <Button
            label={
              loading
                ? 'Show results'
                : `Show ${listings.length} ${listings.length === 1 ? 'result' : 'results'}`
            }
            onPress={() => setShowFilterSheet(false)}
            variant="primary"
            style={styles.sheetApplyBtn}
          />
        </View>
      </BottomSheet>

      {/* ── Sort bottom sheet ────────────────────────────── */}
      <BottomSheet visible={showSortSheet} onClose={() => setShowSortSheet(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Sort by</Text>
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={styles.sortRow}
              onPress={() => selectSort(value)}
              activeOpacity={0.6}
            >
              <Text style={[styles.sortLabel, sort === value && styles.sortLabelActive]}>
                {label}
              </Text>
              {sort === value && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Search bar
    searchBarWrapper: {
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      zIndex: 10,
    },

    // Shop heading + tab bar
    shopHeading: {
      fontSize: 28,
      fontFamily: 'Inter_500Medium',
      color: colors.textPrimary,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xl,
    },
    tabBar: {
      flexDirection: 'row',
      gap: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tab: {
      paddingBottom: Spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.textPrimary,
    },
    tabLabel: {
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
    },
    tabLabelActive: {
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },

    // Results header (replaces search bar)
    resultsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.xs,
    },
    backBtn: { padding: Spacing.xs },
    resultsHeaderTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
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

    // Browse directory
    browseScroll: {
      zIndex: 1,
    },
    browseContent: {
      paddingBottom: Spacing['3xl'],
    },
    sectionHeading: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginTop: Spacing.lg,
      marginBottom: Spacing.xs,
    },
    rowDivider: {
      marginVertical: 0,
    },

    clearLink: {
      ...Typography.caption,
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },

    // Sub-category tabs
    subTabScroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    subTabRow: {
      gap: Spacing.xl,
      paddingTop: Spacing.base,
      paddingBottom: Spacing.md,
    },
    subTab: {
      paddingBottom: Spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    subTabActive: {
      borderBottomColor: colors.textPrimary,
    },
    subTabLabel: {
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
    },
    subTabLabelActive: {
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },

    // Results grid
    resultsCount: {
      ...Typography.caption,
      color: colors.textSecondary,
      paddingBottom: Spacing.sm,
    },
    gridContent: { flexGrow: 1, paddingBottom: Spacing['4xl'] },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },

    // Filter sheet
    sheetContent: {
      paddingHorizontal: Spacing.xs,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.base,
    },
    sheetTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    sheetSectionLabel: {
      ...Typography.label,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    sheetChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginBottom: Spacing.base,
    },
    sheetApplyBtn: {
      marginTop: Spacing.sm,
    },

    // Sort sheet
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sortLabel: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    sortLabelActive: {
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
    },
  });
}
