import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Swipeable } from 'react-native-gesture-handler';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar } from '@/components/SearchBar';
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
  Categories,
  BorderRadius,
  BorderWidth,
  ColorTokens,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

// ─── Constants ──────────────────────────────────────────────

const RECENT_KEY = '@dukanoh/recent_searches';
const MAX_RECENT = 6;
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

// Exclude categories that overlap with occasions to avoid duplicates in browse
const BROWSE_CATEGORIES = Categories.filter(
  c => c !== 'All' && c !== 'Partywear' && c !== 'Festive' && c !== 'Formal' && c !== 'Wedding',
);
const MORE_CATEGORIES = BROWSE_CATEGORIES.slice(3);

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'];
const POPULAR_SEARCHES = ['Lehenga', 'Sherwani', 'Saree', 'Kurta', 'Anarkali', 'Dupatta'];

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

// ─── Main screen ────────────────────────────────────────────

export default function SearchScreen() {
  // Search state
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Results state
  const [resultsMode, setResultsMode] = useState(false);
  const [resultsTitle, setResultsTitle] = useState('');
  const [resultsCategory, setResultsCategory] = useState<string | null>(null);
  const [resultsOccasionPreset, setResultsOccasionPreset] = useState<string | null>(null);
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

  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // ─── Init ───────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(val => {
      if (val) setRecentSearches(JSON.parse(val));
    });
  }, []);

  // ─── Search helpers ─────────────────────────────────────
  const saveSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const deduped = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
      return deduped;
    });
  }, []);

  const removeSearch = useCallback((term: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== term);
      if (updated.length === 0) AsyncStorage.removeItem(RECENT_KEY);
      else AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearSearches = useCallback(() => {
    AsyncStorage.removeItem(RECENT_KEY);
    setRecentSearches([]);
  }, []);

  // ─── Navigation into results ────────────────────────────
  const openCategory = useCallback((cat: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setResultsMode(true);
    setResultsTitle(cat);
    setResultsCategory(cat);
    setResultsOccasionPreset(null);
    setFocused(false);
  }, []);

  const openOccasion = useCallback((occ: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setResultsMode(true);
    setResultsTitle(occ);
    setResultsCategory(null);
    setResultsOccasionPreset(occ);
    setActiveOccasions([occ]);
    setFocused(false);
  }, []);

  const openSearch = useCallback((term: string) => {
    LayoutAnimation.configureNext(TRANSITION);
    setQuery(term);
    setResultsMode(true);
    setResultsTitle(`\u201C${term}\u201D`);
    setResultsCategory(null);
    setResultsOccasionPreset(null);
    setFocused(false);
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
  }, [query, resultsCategory, activeSizes, activeOccasions, activeConditions, activePriceRange, sort]);

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
  }, [resultsMode, buildQuery, applyClientFilters]);

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

  // ─── Determine view state ──────────────────────────────
  const trimmedInput = query.trim().toLowerCase();
  const filteredRecent = trimmedInput
    ? recentSearches.filter(s => s.toLowerCase().includes(trimmedInput))
    : recentSearches;
  const showRecentPanel = focused && !resultsMode && filteredRecent.length > 0;
  const showPopularPanel = focused && !resultsMode && filteredRecent.length === 0 && !trimmedInput;

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
            <View style={styles.headerSpacer} />
          </View>
        ) : (
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmit={(term) => {
              if (term.trim()) openSearch(term);
            }}
          />
        )}
      </View>

      {/* ── Recent searches panel ────────────────────────── */}
      {showRecentPanel && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionHeading}>Recent</Text>
            <TouchableOpacity onPress={clearSearches} hitSlop={8}>
              <Text style={styles.clearLink}>Clear all</Text>
            </TouchableOpacity>
          </View>
          {filteredRecent.map(term => (
            <Swipeable
              key={term}
              renderRightActions={() => (
                <TouchableOpacity
                  style={styles.swipeDelete}
                  onPress={() => removeSearch(term)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              overshootRight={false}
            >
              <TouchableOpacity
                style={[styles.recentRow, { backgroundColor: colors.background }]}
                onPress={() => openSearch(term)}
                activeOpacity={0.6}
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.recentTerm}>{term}</Text>
              </TouchableOpacity>
            </Swipeable>
          ))}
        </View>
      )}

      {/* ── Popular searches (no recent history) ────────── */}
      {showPopularPanel && (
        <View style={styles.panel}>
          <Text style={styles.sectionHeading}>Popular searches</Text>
          {POPULAR_SEARCHES.map(term => (
            <TouchableOpacity
              key={term}
              style={styles.recentRow}
              onPress={() => openSearch(term)}
              activeOpacity={0.6}
            >
              <Ionicons name="trending-up-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.recentTerm}>{term}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Browse directory ─────────────────────────────── */}
      {!resultsMode && !showRecentPanel && !showPopularPanel && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.browseContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          {/* Shop by category */}
          <Text style={styles.sectionHeading}>Shop by category</Text>
          {BROWSE_CATEGORIES.slice(0, 3).map((cat, i) => (
            <React.Fragment key={cat}>
              <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
              {i < 2 && <Divider style={styles.rowDivider} />}
            </React.Fragment>
          ))}

          <HeroBanner source={HERO_BANNER_1} onPress={() => openCategory('Women')} />

          {/* Shop by occasion */}
          <Text style={styles.sectionHeading}>Shop by occasion</Text>
          {OCCASIONS.map((occ, i) => (
            <React.Fragment key={occ}>
              <BrowseRow label={occ} onPress={() => openOccasion(occ)} colors={colors} />
              {i < OCCASIONS.length - 1 && <Divider style={styles.rowDivider} />}
            </React.Fragment>
          ))}

          <HeroBanner source={HERO_BANNER_2} onPress={() => openOccasion('Wedding')} />

          {/* Remaining categories */}
          <Text style={styles.sectionHeading}>More categories</Text>
          {MORE_CATEGORIES.map((cat, i) => (
            <React.Fragment key={cat}>
              <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
              {i < MORE_CATEGORIES.length - 1 && <Divider style={styles.rowDivider} />}
            </React.Fragment>
          ))}
        </ScrollView>
      )}

      {/* ── Results view ─────────────────────────────────── */}
      {resultsMode && (
        <>
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlBtn, isSorted && styles.controlBtnActive]}
              onPress={() => setShowSortSheet(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="swap-vertical-outline"
                size={15}
                color={isSorted ? colors.background : colors.textPrimary}
              />
              <Text style={[styles.controlText, isSorted && styles.controlTextActive]}>Sort</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, filterCount > 0 && styles.controlBtnActive]}
              onPress={() => setShowFilterSheet(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="options-outline"
                size={15}
                color={filterCount > 0 ? colors.background : colors.textPrimary}
              />
              <Text style={[styles.controlText, filterCount > 0 && styles.controlTextActive]}>
                {filterCount > 0 ? `Filter (${filterCount})` : 'Filter'}
              </Text>
            </TouchableOpacity>
          </View>

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
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            )}
            ListHeaderComponent={
              !loading ? (
                <Text style={styles.resultsCount}>
                  {listings.length} {listings.length === 1 ? 'result' : 'results'}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              loading
                ? <LoadingSpinner />
                : fetchError
                  ? <EmptyState
                      heading="Something went wrong"
                      subtext="Check your connection and try again."
                    />
                  : <EmptyState
                      heading="No listings found"
                      subtext="Try adjusting your filters or search term."
                    />
            }
            ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
          />
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
    headerSpacer: { width: 32 },

    // Browse directory
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

    // Recent searches panel
    panel: { paddingTop: Spacing.xs },
    panelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    clearLink: {
      ...Typography.caption,
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    recentTerm: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    swipeDelete: {
      backgroundColor: colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 60,
      borderRadius: BorderRadius.small,
      marginVertical: 2,
    },

    // Sort & filter controls
    controls: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingBottom: Spacing.sm,
    },
    controlBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      height: 42,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    controlBtnActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary,
    },
    controlText: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    controlTextActive: {
      color: colors.background,
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
