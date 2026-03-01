import React from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { ListingCard } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useBasket } from '@/hooks/useBasket';

export default function BasketScreen() {
  const { items, count, loading, removeItem } = useBasket();

  if (loading) return <LoadingSpinner />;

  return (
    <ScreenWrapper>
      <Header
        showBack
        title={count > 0 ? `Basket (${count})` : 'Basket'}
      />
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <ListingCard
              listing={item.listing}
              variant="featured"
              onPress={() => router.push(`/listing/${item.listing_id}`)}
              style={styles.card}
            />
            <View style={styles.actions}>
              <Button
                label="Message Seller"
                size="md"
                onPress={() => router.push(`/conversation/${item.listing_id}`)}
                style={styles.messageBtn}
              />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeItem(item.listing_id)}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="cart-outline" size={48} color={Colors.textSecondary} />}
            heading="Your basket is empty"
            subtext="Add listings you're interested in to keep track of them."
            ctaLabel="Browse listings"
            onCta={() => router.push('/(tabs)/search')}
          />
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 1,
    padding: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  item: { marginBottom: Spacing.sm },
  card: { marginBottom: 0 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  messageBtn: { flex: 1, marginRight: Spacing.md },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  removeText: {
    ...Typography.caption,
    color: Colors.error,
    fontFamily: 'Inter_600SemiBold',
  },
});
