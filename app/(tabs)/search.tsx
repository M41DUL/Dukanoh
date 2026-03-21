import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/Badge';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, Categories, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

const RECENT_KEY = '@dukanoh/recent_searches';
const MAX_RECENT = 6;

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'];

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'most_saved' | 'most_viewed';
const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low → High', value: 'price_asc' },
  { label: 'Price: High → Low', value: 'price_desc' },
  { label: 'Most saved', value: 'most_saved' },
  { label: 'Most viewed', value: 'most_viewed' },
];

interface PriceRange { label: string; min: number; max: number; }
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under £25', min: 0, max: 25 },
  { label: '£25–£75', min: 25, max: 75 },
  { label: '£75–£150', min: 75, max: 150 },
  { label: '£150+', min: 150, max: Infinity },
];

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

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingCategories, setTrendingCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeSizes, setActiveSizes] = useState<string[]>([]);
  const [activeOccasions, setActiveOccasions] = useState<string[]>([]);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(null);
  const [sort, setSort] = useState<SortOption>('newest');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const fuseRef = useRef<Fuse<Listing> | null>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(val => {
      if (val) setRecentSearches(JSON.parse(val));
    });
    fetchTrendingCategories().then(setTrendingCategories);
  }, []);

  const saveSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const deduped = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
      return deduped;
    });
  }, []);

  const clearSearches = useCallback(() => {
    AsyncStorage.removeItem(RECENT_KEY);
    setRecentSearches([]);
  }, []);

  const applySearch = useCallback((term: string) => {
    setQuery(term);
    setFocused(false);
    saveSearch(term);
  }, [saveSearch]);

  const applyCategory = useCallback((cat: string) => {
    setActiveCategory(cat);
    setFocused(false);
  }, []);

  const toggleSize = useCallback((size: string) => {
    setActiveSizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  }, []);

  const toggleOccasion = useCallback((occ: string) => {
    setActiveOccasions(prev =>
      prev.includes(occ) ? prev.filter(o => o !== occ) : [...prev, occ]
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);

      // Build sort order
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

      // Apply category filter
      if (activeCategory !== 'All') q = q.eq('category', activeCategory);

      // Apply multi-select size filter (OR — match any selected size)
      if (activeSizes.length === 1) {
        q = q.ilike('size', `%${activeSizes[0]}%`);
      } else if (activeSizes.length > 1) {
        // Supabase doesn't support OR on ilike natively, so fetch broader and filter client-side
      }

      // Apply multi-select occasion filter
      if (activeOccasions.length === 1) {
        q = q.eq('occasion', activeOccasions[0]);
      } else if (activeOccasions.length > 1) {
        q = q.in('occasion', activeOccasions);
      }

      // Apply price range
      if (activePriceRange) {
        q = q.gte('price', activePriceRange.min);
        if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
      }

      // For text search, fetch broader set and apply fuzzy matching client-side
      // ilike for initial narrowing, fuse.js for re-ranking
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        q = q.or(`title.ilike.%${trimmedQuery}%,category.ilike.%${trimmedQuery}%,occasion.ilike.%${trimmedQuery}%`);
      }

      const { data } = await q;
      let results = (data ?? []) as unknown as Listing[];

      // Client-side multi-size filter when > 1 size selected
      if (activeSizes.length > 1) {
        const sizeLower = activeSizes.map(s => s.toLowerCase());
        results = results.filter(l =>
          l.size && sizeLower.some(s => l.size!.toLowerCase().includes(s))
        );
      }

      // Fuzzy re-rank with fuse.js when there's a text query
      if (trimmedQuery && results.length > 0) {
        fuseRef.current = new Fuse(results, {
          keys: [
            { name: 'title', weight: 0.6 },
            { name: 'category', weight: 0.2 },
            { name: 'occasion', weight: 0.2 },
          ],
          threshold: 0.4,
          includeScore: true,
        });
        const fuseResults = fuseRef.current.search(trimmedQuery);
        results = fuseResults.map(r => r.item);
      }

      setListings(results);
      setLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [query, activeCategory, activeSizes, activeOccasions, activePriceRange, sort]);

  const showPanel = focused && !query.trim() &&
    (recentSearches.length > 0 || trendingCategories.length > 0);

  const activeFilterCount = activeSizes.length + activeOccasions.length + (activePriceRange ? 1 : 0);

  return (
    <ScreenWrapper>
      <View style={styles.searchBarWrapper}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmit={saveSearch}
        />
      </View>

      {showPanel ? (
        <View style={styles.panel}>
          {recentSearches.length > 0 && (
            <>
              <View style={styles.panelHeader}>
                <Text style={styles.panelLabel}>Recent</Text>
                <TouchableOpacity onPress={clearSearches} hitSlop={8}>
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map(term => (
                <TouchableOpacity
                  key={term}
                  style={styles.recentRow}
                  onPress={() => applySearch(term)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.recentTerm}>{term}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {trendingCategories.length > 0 && (
            <View style={recentSearches.length > 0 ? styles.trendingSection : undefined}>
              <Text style={styles.panelLabel}>Trending</Text>
              <View style={styles.trendingChips}>
                {trendingCategories.map(cat => (
                  <Badge
                    key={cat}
                    label={cat}
                    active={activeCategory === cat}
                    onPress={() => applyCategory(cat)}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          ListHeaderComponent={
            <View style={styles.filters}>
              {/* Category */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {[...Categories].map(cat => (
                  <Badge
                    key={cat}
                    label={cat}
                    active={activeCategory === cat}
                    onPress={() => setActiveCategory(cat)}
                  />
                ))}
              </ScrollView>

              {/* Size (multi-select) */}
              <Text style={styles.filterLabel}>
                Size{activeSizes.length > 0 ? ` (${activeSizes.length})` : ''}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {SIZES.map(size => (
                  <Badge
                    key={size}
                    label={size}
                    active={activeSizes.includes(size)}
                    onPress={() => toggleSize(size)}
                  />
                ))}
              </ScrollView>

              {/* Occasion (multi-select) */}
              <Text style={styles.filterLabel}>
                Occasion{activeOccasions.length > 0 ? ` (${activeOccasions.length})` : ''}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {OCCASIONS.map(occ => (
                  <Badge
                    key={occ}
                    label={occ}
                    active={activeOccasions.includes(occ)}
                    onPress={() => toggleOccasion(occ)}
                  />
                ))}
              </ScrollView>

              {/* Price */}
              <Text style={styles.filterLabel}>Price</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {PRICE_RANGES.map(range => (
                  <Badge
                    key={range.label}
                    label={range.label}
                    active={activePriceRange?.label === range.label}
                    onPress={() =>
                      setActivePriceRange(prev =>
                        prev?.label === range.label ? null : range
                      )
                    }
                  />
                ))}
              </ScrollView>

              {/* Sort */}
              <Text style={styles.filterLabel}>Sort by</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {SORT_OPTIONS.map(opt => (
                  <Badge
                    key={opt.value}
                    label={opt.label}
                    active={sort === opt.value}
                    onPress={() => setSort(opt.value)}
                  />
                ))}
              </ScrollView>

              {/* Results count + clear filters */}
              {!loading && (
                <View style={styles.resultsRow}>
                  <Text style={styles.resultsCount}>
                    {listings.length} {listings.length === 1 ? 'result' : 'results'}
                  </Text>
                  {activeFilterCount > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setActiveSizes([]);
                        setActiveOccasions([]);
                        setActivePriceRange(null);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.clearFilters}>Clear filters</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            loading
              ? <LoadingSpinner />
              : <EmptyState
                  heading="No listings found"
                  subtext="Try adjusting your filters or search term."
                />
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    searchBarWrapper: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing.sm,
    },
    filters: { paddingTop: Spacing.sm },
    chipRow: { gap: Spacing.xs, paddingBottom: Spacing.sm },
    filterLabel: {
      ...Typography.label,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    resultsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    resultsCount: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    clearFilters: {
      ...Typography.caption,
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },
    grid: { flexGrow: 1, paddingTop: Spacing.sm, paddingBottom: Spacing['4xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
    panel: { paddingTop: Spacing.xs },
    panelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    panelLabel: {
      ...Typography.label,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    clearAll: {
      ...Typography.caption,
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: Spacing.xs,
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
    trendingSection: {
      marginTop: Spacing.base,
    },
    trendingChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
  });
}
