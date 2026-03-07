import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);

      let q = supabase
        .from('listings')
        .select('*, seller:users(username, avatar_url)')
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (query.trim()) q = q.ilike('title', `%${query.trim()}%`);
      if (activeCategory !== 'All') q = q.eq('category', activeCategory);
      if (activeSize) q = q.ilike('size', `%${activeSize}%`);
      if (activePriceRange) {
        q = q.gte('price', activePriceRange.min);
        if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
      }

      const { data } = await q;
      setListings((data ?? []) as unknown as Listing[]);
      setLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [query, activeCategory, activeSize, activePriceRange]);

  const showPanel = focused && !query.trim() &&
    (recentSearches.length > 0 || trendingCategories.length > 0);

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

              <Text style={styles.filterLabel}>Size</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {SIZES.map(size => (
                  <Badge
                    key={size}
                    label={size}
                    active={activeSize === size}
                    onPress={() => setActiveSize(prev => prev === size ? null : size)}
                  />
                ))}
              </ScrollView>

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
              {!loading && (
                <Text style={styles.resultsCount}>
                  {listings.length} {listings.length === 1 ? 'result' : 'results'}
                </Text>
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
    resultsCount: {
      ...Typography.caption,
      color: colors.textSecondary,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
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
