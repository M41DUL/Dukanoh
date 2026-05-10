import React, { useCallback, useMemo, useState } from 'react';
import { searchFocusRequest } from '@/lib/searchFocusRequest';
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
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
import { useStories, useAppStories } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useFeed } from '@/hooks/useFeed';
import { useBlocked } from '@/context/BlockedContext';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { JustSoldToast } from '@/components/JustSoldToast';
import { JUST_SOLD_TOAST_ENABLED } from '@/lib/featureFlags';
import { DukanohFitSheet } from '@/components/DukanohFitSheet';

export default function HomeScreen() {
  const [fitSheetVisible, setFitSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const { stories, loading: storiesLoading, markViewed, refetch: refetchStories } = useStories();
  const { appStories, refetch: refetchAppStories } = useAppStories();
  const allStories = [...appStories, ...stories];
  const { items: recentItems, refetch: refetchRecent } = useRecentlyViewed(user?.id);

  const {
    suggested,
    newArrivals,
    trending,
    priceDrops,
    preferredCategories,
    isLoading,
    isError,
    refetch: refetchFeed,
    nudgeSlides,
    showFitNudge,
    markFitSeen,
  } = useFeed({ userId: user?.id, blockedIds });

  const allNudgeSlides = useMemo(() => {
    if (!showFitNudge) return nudgeSlides;
    return [
      {
        key: 'fit',
        icon: 'camera-outline' as const,
        title: 'Dukanoh Fit',
        subtitle: 'Snap a piece and find what matches it',
        onPress: () => { markFitSeen(); setFitSheetVisible(true); },
        gradientColors: (isDark ? ['rgba(199,247,94,0.12)', colors.surface] : ['#E8FBC5', colors.surface]) as [string, string],
        iconColor: isDark ? colors.secondary : colors.textPrimary,
        iconBg: isDark ? 'rgba(199,247,94,0.15)' : 'rgba(0,0,0,0.1)',
      },
      ...nudgeSlides,
    ];
  }, [showFitNudge, nudgeSlides, markFitSeen, isDark, colors]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchFeed(), refetchRecent(), refetchStories(), refetchAppStories()]);
    setRefreshing(false);
  }, [refetchFeed, refetchRecent, refetchStories, refetchAppStories]);

  useRefreshOnFocus(refetchFeed);
  useRefreshOnFocus(refetchRecent);
  useRefreshOnFocus(refetchStories);

  return (
    <ScreenWrapper contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <DukanohLogo width={80} height={14} color={isDark ? colors.secondary : colors.primary} />
          <TouchableOpacity
            onPress={() => { searchFocusRequest.pending = true; router.navigate('/(tabs)/search'); }}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Ionicons name="search-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.feedContent}>
            <View style={styles.padded}>
              <SkeletonSection />
              <SkeletonSection />
            </View>
          </ScrollView>
        ) : isError ? (
          <View style={styles.padded}>
            <EmptyState
              icon={<Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />}
              heading="Couldn't load your feed"
              subtext="Check your connection and try again."
              ctaLabel="Retry"
              onCta={() => refetchFeed()}
            />
          </View>
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
            {!storiesLoading && (
              <StoriesRow stories={allStories} onView={markViewed} />
            )}

            {suggested.length > 0 && (
              <View style={[styles.section, { marginTop: Spacing.md, paddingHorizontal: 0 }]}>
                <View style={styles.padded}>
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
                </View>
                <HorizontalListings items={suggested} />
              </View>
            )}

            {allNudgeSlides.length > 0 && (
              <NudgeCarousel slides={allNudgeSlides} />
            )}

            <View style={styles.padded}>
              <PriceDropsRow drops={priceDrops} colors={colors} />
            </View>

            {newArrivals.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title="New arrivals"
                  subtitle="Latest pieces"
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
              <View style={styles.padded}>
                <EmptyState
                  icon={<Ionicons name="shirt-outline" size={48} color={colors.textSecondary} />}
                  heading="Nothing to discover yet"
                  subtext="Be the first to list a piece and get the community started."
                  ctaLabel="Start selling"
                  onCta={() => router.push('/(tabs)/sell')}
                />
              </View>
            ) : null}

            <View style={styles.padded}>
              <TrendingStrip categories={trending} colors={colors} />
            </View>

            {recentItems.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Recently viewed" subtitle="Pick up where you left off" />
                <ListingsGrid items={recentItems} />
              </View>
            )}
          </ScrollView>
        )}
        {JUST_SOLD_TOAST_ENABLED && <JustSoldToast />}
      </View>
      <DukanohFitSheet visible={fitSheetVisible} onClose={() => setFitSheetVisible(false)} />
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    container: { flex: 1 },
    padded: {
      paddingHorizontal: Spacing.base,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      paddingHorizontal: Spacing.base,
    },
    iconBtn: {
      padding: Spacing.xs,
    },
    feedContent: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
    section: { marginBottom: Spacing.xl, paddingHorizontal: Spacing.base },
  });
}
