import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
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
const HERO_BANNER_1 = require('@/assets/images/hero-banner-1.png');
const HERO_BANNER_2 = require('@/assets/images/hero-banner-2.png');

const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'];

// Exclude categories that overlap with occasions to avoid duplicates in browse
const BROWSE_CATEGORIES = Categories.filter(
  c => c !== 'All' && c !== 'Partywear' && c !== 'Festive' && c !== 'Formal' && c !== 'Wedding',
);

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

function HeroBanner({ source }: { source: number }) {
  return (
    <View style={heroBannerStyles.container}>
      <Image
        source={source}
        style={heroBannerStyles.image}
        contentFit="cover"
        transition={300}
      />
    </View>
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

  const fuseRef = useRef<Fuse<Listing> | null>(null);
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

  const clearSearches = useCallback(() => {
    AsyncStorage.removeItem(RECENT_KEY);
    setRecentSearches([]);
  }, []);

  // ─── Navigation into results ────────────────────────────
  const openCategory = useCallback((cat: string) => {
    setResultsMode(true);
    setResultsTitle(cat);
    setResultsCategory(cat);
    setResultsOccasionPreset(null);
    setFocused(false);
  }, []);

  const openOccasion = useCallback((occ: string) => {
    setResultsMode(true);
    setResultsTitle(occ);
    setResultsCategory(null);
    setResultsOccasionPreset(occ);
    setActiveOccasions([occ]);
    setFocused(false);
  }, []);

  const openSearch = useCallback((term: string) => {
    setQuery(term);
    setResultsMode(true);
    setResultsTitle(`\u201C${term}\u201D`);
    setResultsCategory(null);
    setResultsOccasionPreset(null);
    setFocused(false);
    saveSearch(term);
  }, [saveSearch]);

  const exitResults = useCallback(() => {
    setResultsMode(false);
    setResultsCategory(null);
    setResultsOccasionPreset(null);
    setQuery('');
    setActiveSizes([]);
    setActiveOccasions([]);
    setActiveConditions([]);
    setActivePriceRange(null);
    setSort('newest');
  }, []);

  // ─── Filter helpers ─────────────────────────────────────
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

  const toggleCondition = useCallback((cond: string) => {
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

  const showSortAlert = () => {
    Alert.alert('Sort by', undefined, [
      ...Object.entries(SORT_LABELS).map(([value, label]) => ({
        text: sort === value ? `\u2713  ${label}` : label,
        onPress: () => setSort(value as SortOption),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // ─── Fetch results ──────────────────────────────────────
  useEffect(() => {
    if (!resultsMode) return;

    const timer = setTimeout(async () => {
      setLoading(true);

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

      // Category (from browse tap)
      if (resultsCategory) q = q.eq('category', resultsCategory);

      // Multi-select size
      if (activeSizes.length === 1) {
        q = q.ilike('size', `%${activeSizes[0]}%`);
      }

      // Multi-select occasion
      if (activeOccasions.length === 1) {
        q = q.eq('occasion', activeOccasions[0]);
      } else if (activeOccasions.length > 1) {
        q = q.in('occasion', activeOccasions);
      }

      // Multi-select condition
      if (activeConditions.length === 1) {
        q = q.eq('condition', activeConditions[0]);
      } else if (activeConditions.length > 1) {
        q = q.in('condition', activeConditions);
      }

      // Price range
      if (activePriceRange) {
        q = q.gte('price', activePriceRange.min);
        if (activePriceRange.max !== Infinity) q = q.lte('price', activePriceRange.max);
      }

      // Text search
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        q = q.or(`title.ilike.%${trimmedQuery}%,category.ilike.%${trimmedQuery}%,occasion.ilike.%${trimmedQuery}%`);
      }

      const { data } = await q;
      let results = (data ?? []) as unknown as Listing[];

      // Client-side multi-size filter
      if (activeSizes.length > 1) {
        const sizeLower = activeSizes.map(s => s.toLowerCase());
        results = results.filter(l =>
          l.size && sizeLower.some(s => l.size!.toLowerCase().includes(s))
        );
      }

      // Fuzzy re-rank
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
        results = fuseRef.current.search(trimmedQuery).map(r => r.item);
      }

      setListings(results);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [resultsMode, query, resultsCategory, activeSizes, activeOccasions, activeConditions, activePriceRange, sort]);

  // ─── Determine view state ──────────────────────────────
  const showRecentPanel = focused && !query.trim() && recentSearches.length > 0;

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
            onChangeText={(text) => {
              setQuery(text);
              if (text.trim()) {
                setFocused(false);
              }
            }}
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
          {recentSearches.map(term => (
            <TouchableOpacity
              key={term}
              style={styles.recentRow}
              onPress={() => openSearch(term)}
              activeOpacity={0.6}
            >
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.recentTerm}>{term}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Browse directory ─────────────────────────────── */}
      {!resultsMode && !showRecentPanel && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.browseContent}>
          {/* Shop by category */}
          <Text style={styles.sectionHeading}>Shop by category</Text>
          {BROWSE_CATEGORIES.slice(0, 3).map((cat, i) => (
            <React.Fragment key={cat}>
              <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
              {i < 2 && <Divider style={styles.rowDivider} />}
            </React.Fragment>
          ))}

          <HeroBanner source={HERO_BANNER_1} />

          {/* Shop by occasion */}
          <Text style={styles.sectionHeading}>Shop by occasion</Text>
          {OCCASIONS.map((occ, i) => (
            <React.Fragment key={occ}>
              <BrowseRow label={occ} onPress={() => openOccasion(occ)} colors={colors} />
              {i < OCCASIONS.length - 1 && <Divider style={styles.rowDivider} />}
            </React.Fragment>
          ))}

          <HeroBanner source={HERO_BANNER_2} />

          {/* Remaining categories */}
          <Text style={styles.sectionHeading}>More categories</Text>
          {BROWSE_CATEGORIES.slice(3).map((cat, i) => (
            <React.Fragment key={cat}>
              <BrowseRow label={cat} onPress={() => openCategory(cat)} colors={colors} />
              {i < BROWSE_CATEGORIES.slice(3).length - 1 && <Divider style={styles.rowDivider} />}
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
              onPress={showSortAlert}
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
                : <EmptyState
                    heading="No listings found"
                    subtext="Try adjusting your filters or search term."
                  />
            }
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
                onPress={() =>
                  setActivePriceRange(prev =>
                    prev?.label === range.label ? null : range
                  )
                }
              />
            ))}
          </View>

          <Button
            label={filterCount > 0 ? `Show results (${filterCount} active)` : 'Show results'}
            onPress={() => setShowFilterSheet(false)}
            variant="primary"
            style={styles.sheetApplyBtn}
          />
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
  });
}
