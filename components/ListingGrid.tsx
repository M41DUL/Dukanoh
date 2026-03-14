import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Spacing } from '@/constants/theme';

interface ListingGridProps {
  listings: Listing[];
}

export function ListingGrid({ listings }: ListingGridProps) {
  const rows: Listing[][] = [];
  for (let i = 0; i < listings.length; i += 2) {
    rows.push(listings.slice(i, i + 2));
  }

  return (
    <View>
      {rows.map((row, i) => (
        <View key={i} style={styles.gridRow}>
          {row.map(item => (
            <ListingCard
              key={item.id}
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          ))}
          {row.length === 1 && <View style={styles.emptyCell} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  emptyCell: { flex: 1 },
});
