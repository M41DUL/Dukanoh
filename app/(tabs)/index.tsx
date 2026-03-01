import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { ListingCard, Listing } from '@/components/ListingCard';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useBasket } from '@/hooks/useBasket';
import { useStories } from '@/hooks/useStories';

const DUMMY_LISTINGS: Listing[] = [
  {
    id: '1',
    title: 'Embroidered Anarkali Suit',
    price: 45.00,
    category: 'Women',
    condition: 'Excellent',
    size: 'M',
    status: 'available',
    images: ['https://picsum.photos/seed/anarkali/400/500'],
    seller: { username: 'fatima_k' },
  },
  {
    id: '2',
    title: 'Men\'s Sherwani — Navy & Gold',
    price: 120.00,
    category: 'Wedding',
    condition: 'New',
    size: 'L',
    status: 'available',
    images: ['https://picsum.photos/seed/sherwani/400/500'],
    seller: { username: 'tariq_m' },
  },
  {
    id: '3',
    title: 'Silk Saree — Deep Red',
    price: 65.00,
    category: 'Festive',
    condition: 'Good',
    size: 'Free',
    status: 'available',
    images: ['https://picsum.photos/seed/saree1/400/500'],
    seller: { username: 'priya_s' },
  },
  {
    id: '4',
    title: 'Pathani Suit — Olive Green',
    price: 38.00,
    category: 'Pathani Suit',
    condition: 'Excellent',
    size: 'XL',
    status: 'available',
    images: ['https://picsum.photos/seed/pathani/400/500'],
    seller: { username: 'zain_r' },
  },
  {
    id: '5',
    title: 'Lehenga Choli — Pink Floral',
    price: 95.00,
    category: 'Partywear',
    condition: 'New',
    size: 'S',
    status: 'available',
    images: ['https://picsum.photos/seed/lehenga/400/500'],
    seller: { username: 'nadia_h' },
  },
  {
    id: '6',
    title: 'Achkan — Ivory Brocade',
    price: 80.00,
    category: 'Achkan',
    condition: 'Excellent',
    size: 'L',
    status: 'available',
    images: ['https://picsum.photos/seed/achkan/400/500'],
    seller: { username: 'imran_a' },
  },
  {
    id: '7',
    title: 'Cotton Kurta Set — Sky Blue',
    price: 28.00,
    category: 'Casualwear',
    condition: 'Good',
    size: 'M',
    status: 'available',
    images: ['https://picsum.photos/seed/kurta1/400/500'],
    seller: { username: 'sara_b' },
  },
  {
    id: '8',
    title: 'Formal Bandhgala Suit',
    price: 110.00,
    category: 'Formal',
    condition: 'New',
    size: 'XL',
    status: 'available',
    images: ['https://picsum.photos/seed/bandhgala/400/500'],
    seller: { username: 'ali_n' },
  },
];

export default function HomeScreen() {
  const { count } = useBasket();
  const { stories, loading: storiesLoading, markViewed } = useStories();

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.searchBar}
            onPress={() => router.push('/(tabs)/search')}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.placeholder}>Search for anything</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.basketButton}
            onPress={() => router.push('/basket')}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={24} color={Colors.textPrimary} />
            {count > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <FlatList
          data={DUMMY_LISTINGS}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            !storiesLoading && stories.length > 0 ? (
              <StoriesRow stories={stories} onView={markViewed} />
            ) : null
          }
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="shirt-outline" size={48} color={Colors.textSecondary} />}
              heading="Your feed is empty"
              subtext="New listings will appear here once sellers start posting."
            />
          }
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    height: 46,
  },
  placeholder: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  basketButton: { position: 'relative', padding: Spacing.xs },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.background,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
  feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
});
