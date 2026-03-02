import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/Badge';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, Categories, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];

interface PriceRange { label: string; min: number; max: number; }
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under £25', min: 0, max: 25 },
  { label: '£25–£75', min: 25, max: 75 },
  { label: '£75–£150', min: 75, max: 150 },
  { label: '£150+', min: 150, max: Infinity },
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeSize, setActiveSize] = useState<string | null>(null);
  const [activePriceRange, setActivePriceRange] = useState<PriceRange | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

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

  return (
    <ScreenWrapper>
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
            <SearchBar value={query} onChangeText={setQuery} style={styles.searchBar} />

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
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    filters: { paddingTop: Spacing.base },
    searchBar: { marginBottom: Spacing.sm },
    chipRow: { gap: Spacing.xs, paddingBottom: Spacing.sm },
    filterLabel: {
      ...Typography.label,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    grid: { flexGrow: 1, paddingTop: Spacing.sm, paddingBottom: Spacing['4xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  });
}
