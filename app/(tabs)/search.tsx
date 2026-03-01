import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/Badge';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, Categories } from '@/constants/theme';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const listings: Listing[] = [];

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          style={styles.searchBar}
        />

        <FlatList
          horizontal
          data={[...Categories]}
          keyExtractor={item => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
          renderItem={({ item }) => (
            <Badge
              label={item}
              active={activeCategory === item}
              onPress={() => setActiveCategory(item)}
            />
          )}
        />

        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              heading="No listings found"
              subtext="Try a different category or search term."
            />
          }
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  categories: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  grid: { flexGrow: 1, paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
});
