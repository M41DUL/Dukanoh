import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { EmptyState } from '@/components/EmptyState';
import { StoriesRow } from '@/components/StoriesRow';
import { SectionHeader } from '@/components/SectionHeader';
import { HorizontalListings } from '@/components/HorizontalListings';
import { DukanohLogo } from '@/components/DukanohLogo';
import {
  SkeletonSection,
  ListingsGrid,
  TrendingStrip,
  PriceDropsRow,
  NudgeCarousel,
} from '@/components/feed';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/context/ThemeContext';
import { useStories, getAppStory } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useFeed } from '@/hooks/useFeed';

export default function HomeScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const { stories, loading: storiesLoading, markViewed } = useStories();
  const allStories = [getAppStory(), ...stories];
  const { items: recentItems, reload: reloadRecent } = useRecentlyViewed(user?.id);

  const {
    suggested,
    newArrivals,
    trending,
    priceDrops,
    preferredCategories,
    loading,
    refreshing,
    displayName,
    greeting,
    nudgeSlides,
    onRefresh,
    loadDataIfStale,
    hasMounted,
  } = useFeed({ userId: user?.id, reloadRecent });

  useFocusEffect(
    useCallback(() => {
      if (hasMounted.current) {
        loadDataIfStale();
        reloadRecent();
      } else {
        hasMounted.current = true;
      }
    }, [loadDataIfStale, reloadRecent, hasMounted])
  );

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <DukanohLogo width={80} height={14} color={isDark ? colors.secondary : colors.textPrimary} />
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(tabs)/search', params: { focus: '1' } })}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Ionicons name="search-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.feedContent}>
            <Text style={styles.greeting}>
              {greeting}{displayName ? `, ${displayName}` : ''}
            </Text>
            <SkeletonSection />
            <SkeletonSection />
          </ScrollView>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={styles.feedContent}
          >
            <Text style={styles.greeting}>
              {greeting}{displayName ? `, ${displayName}` : ''}
            </Text>

            {!storiesLoading && (
              <StoriesRow stories={allStories} onView={markViewed} />
            )}

            {suggested.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title="Suggested for you"
                  subtitle="Based on your preferences"
                  onSeeAll={() =>
                    router.push({
                      pathname: '/listings',
                      params: {
                        title: 'Suggested for you',
                        categories: preferredCategories.join(','),
                      },
                    })
                  }
                />
                <HorizontalListings items={suggested} />
              </View>
            )}

            {nudgeSlides.length > 0 && (
              <NudgeCarousel slides={nudgeSlides} />
            )}

            <PriceDropsRow drops={priceDrops} colors={colors} />

            {newArrivals.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title="New arrivals"
                  subtitle="Just listed"
                  onSeeAll={() =>
                    router.push({
                      pathname: '/listings',
                      params: { title: 'New arrivals' },
                    })
                  }
                />
                <ListingsGrid items={newArrivals} />
              </View>
            ) : suggested.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="shirt-outline" size={48} color={colors.textSecondary} />}
                heading="Nothing to browse yet"
                subtext="Be the first to list something and get the community started."
                ctaLabel="Start selling"
                onCta={() => router.push('/(tabs)/sell')}
              />
            ) : null}

            <TrendingStrip categories={trending} colors={colors} />

            {recentItems.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Recently viewed" subtitle="Pick up where you left off" />
                <ListingsGrid items={recentItems} />
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { flex: 1 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    iconBtn: {
      padding: Spacing.xs,
    },
    greeting: {
      fontSize: 22,
      fontFamily: 'Inter_500Medium',
      color: colors.textPrimary,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
    },
    feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
    section: { marginBottom: Spacing.xl },
  });
}
