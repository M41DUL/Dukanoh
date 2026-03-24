import React, { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Spacing } from '@/constants/theme';

const CARD_WIDTH = 150;

interface HorizontalListingsProps {
  items: Listing[];
}

export function HorizontalListings({ items }: HorizontalListingsProps) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.list}
      removeClippedSubviews={false}
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          variant="grid"
          onPress={() => router.push(`/listing/${item.id}`)}
          style={{ width: CARD_WIDTH, flex: undefined }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    overflow: 'visible',
    marginHorizontal: -Spacing.base,
  },
  content: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
});
