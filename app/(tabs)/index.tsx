import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { Divider } from '@/components/Divider';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useBasket } from '@/hooks/useBasket';
import { useStories } from '@/hooks/useStories';

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
          data={[]}
          keyExtractor={item => item.id}
          renderItem={() => null}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            !storiesLoading && stories.length > 0 ? (
              <>
                <StoriesRow stories={stories} onView={markViewed} />
                <Divider style={styles.divider} />
              </>
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
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  divider: { marginVertical: 0 },
  feedContent: { flexGrow: 1 },
});
