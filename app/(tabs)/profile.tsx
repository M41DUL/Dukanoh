import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily, proColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { ComponentProps } from 'react';

// ── Dukanoh Pro theme — sourced from design system ───────────
const HUB = {
  background:    proColors.background,
  surface:       proColors.surface,
  accent:        proColors.primary,
  textPrimary:   proColors.textPrimary,
  textSecondary: proColors.textSecondary,
  border:        proColors.border,
} as const;

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const HUB_FEATURES: { icon: IoniconsName; label: string }[] = [
  { icon: 'flash-outline',            label: '3 free boosts every month' },
  { icon: 'bar-chart-outline',        label: 'Analytics & earnings dashboard' },
  { icon: 'shield-checkmark-outline', label: 'Pro seller badge' },
  { icon: 'folder-outline',           label: 'Collections & archive' },
  { icon: 'share-social-outline',     label: 'Share kit for Instagram & WhatsApp' },
  { icon: 'pricetag-outline',         label: 'Price drop alerts to saved buyers' },
];

interface QuickAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
}

const STALE_MS = 30_000;

const quickActions: QuickAction[] = [
  { icon: 'bag-outline', label: 'My Listings', onPress: () => router.push('/orders') },
  { icon: 'wallet-outline', label: 'Wallet', onPress: () => router.push('/wallet') },
  { icon: 'heart-outline', label: 'Saved', onPress: () => router.push('/saved') },
  { icon: 'settings-outline', label: 'Settings', onPress: () => router.push('/settings') },
];

interface HubSummary {
  totalViews: number;
  totalSaves: number;
  totalEarned: number;
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const [sellerTier, setSellerTier] = useState<string>('free');
  const [isVerified, setIsVerified] = useState(false);
  const [listingCount, setListingCount] = useState(0);
  const [hubSummary, setHubSummary] = useState<HubSummary | null>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [username, setUsername] = useState(user?.user_metadata?.username ?? '');
  const lastFetchedRef = useRef<number>(0);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, avatar_url, rating_avg, rating_count, seller_tier, is_verified, username')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .neq('status', 'archived'),
    ]);
    if (error) {
      // fetchProfile failed silently
      return;
    }
    if (data) {
      const name = data.full_name === 'New User' ? '' : (data.full_name ?? '');
      setProfileName(name);
      setProfileAvatar(data.avatar_url ?? undefined);
      setRatingAvg(data.rating_avg ?? 0);
      setRatingCount(data.rating_count ?? 0);
      setSellerTier(data.seller_tier ?? 'free');
      setIsVerified(data.is_verified ?? false);
      if (data.username) setUsername(data.username);
    }
    setListingCount(count ?? 0);
    lastFetchedRef.current = Date.now();
  }, [user]);

  const fetchHubSummary = useCallback(async () => {
    if (!user || sellerTier !== 'pro') return;
    const [{ count: viewCount }, { data: saves }, { data: earned }] = await Promise.all([
      supabase
        .from('listing_views')
        .select('listing_id, listings!inner(seller_id)', { count: 'exact' })
        .eq('listings.seller_id', user.id),
      supabase
        .from('listings')
        .select('save_count')
        .eq('seller_id', user.id),
      supabase
        .from('transactions')
        .select('amount')
        .eq('seller_id', user.id),
    ]);
    const totalViews = viewCount ?? 0;
    const totalSaves = (saves ?? []).reduce((sum: number, l: any) => sum + (l.save_count ?? 0), 0);
    const totalEarned = (earned ?? []).reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);
    setHubSummary({ totalViews, totalSaves, totalEarned });
  }, [user, sellerTier]);

  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastFetchedRef.current > STALE_MS) {
      fetchProfile();
    }
  }, [fetchProfile]));

  useFocusEffect(useCallback(() => {
    if (sellerTier === 'pro') fetchHubSummary();
  }, [fetchHubSummary, sellerTier]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchedRef.current = 0;
    await Promise.all([fetchProfile(), sellerTier === 'pro' ? fetchHubSummary() : Promise.resolve()]);
    setRefreshing(false);
  }, [fetchProfile, fetchHubSummary, sellerTier]);

  return (
    <ScreenWrapper contentStyle={{ paddingHorizontal: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Centered profile header ── */}
        <View style={styles.profileHeader}>
          <Avatar
            uri={profileAvatar}
            initials={(profileName || username)[0]?.toUpperCase()}
            size="xlarge"
          />
          {profileName ? (
            <Text style={styles.name}>{profileName}</Text>
          ) : null}
          <Text style={styles.username}>@{username}</Text>
          {(isVerified || sellerTier === 'pro') && (
            <View style={styles.badgeRow}>
              {isVerified && (
                <View style={[styles.badgePill, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.badgePillText, { color: colors.primaryText }]}>✓ Verified</Text>
                </View>
              )}
              {sellerTier === 'pro' && (
                <View style={[styles.badgePill, { backgroundColor: proColors.primaryLight }]}>
                  <Text style={[styles.badgePillText, { color: proColors.primaryText }]}>◆ Pro</Text>
                </View>
              )}
            </View>
          )}
          {ratingCount > 0 ? (
            <View style={styles.ratingRow}>
              <StarRating rating={ratingAvg} size={14} />
              <Text style={styles.ratingText}>
                {ratingAvg.toFixed(1)} ({ratingCount})
              </Text>
            </View>
          ) : (
            <Text style={styles.noReviews}>No reviews yet</Text>
          )}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/edit-profile')}
            activeOpacity={0.7}
          >
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick action icons ── */}
        <View style={styles.quickActions}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickAction}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name={action.icon} size={24} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dukanoh Pro entry card ── */}
        {listingCount > 0 && (
          <TouchableOpacity
            style={styles.hubCard}
            onPress={() => router.push('/seller-hub')}
            activeOpacity={0.85}
          >
            <View style={styles.hubCardHeader}>
              <Text style={styles.hubCardTitle}>Dukanoh Pro</Text>
              {sellerTier === 'pro' ? (
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>Pro ✦</Text>
                </View>
              ) : (
                <Ionicons name="lock-closed" size={16} color={HUB.textSecondary} />
              )}
            </View>

            {sellerTier !== 'pro' && (
              <View style={styles.hubFeatureList}>
                {HUB_FEATURES.map(f => (
                  <View key={f.label} style={styles.hubFeatureRow}>
                    <View style={styles.hubFeatureIconWrap}>
                      <Ionicons name={f.icon} size={14} color={HUB.accent} />
                    </View>
                    <Text style={styles.hubFeatureLabel}>{f.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {sellerTier === 'pro' && hubSummary ? (
              <>
                <View style={styles.hubMetrics}>
                  <View style={styles.hubMetric}>
                    <Text style={styles.hubMetricValue}>£{hubSummary.totalEarned.toFixed(0)}</Text>
                    <Text style={styles.hubMetricLabel}>Earned</Text>
                  </View>
                  <View style={styles.hubMetricDivider} />
                  <View style={styles.hubMetric}>
                    <Text style={styles.hubMetricValue}>{hubSummary.totalViews}</Text>
                    <Text style={styles.hubMetricLabel}>Views</Text>
                  </View>
                  <View style={styles.hubMetricDivider} />
                  <View style={styles.hubMetric}>
                    <Text style={styles.hubMetricValue}>{hubSummary.totalSaves}</Text>
                    <Text style={styles.hubMetricLabel}>Saves</Text>
                  </View>
                </View>
                <View style={styles.hubCardFooter}>
                  <Text style={styles.hubCardFooterText}>Open Dukanoh Pro</Text>
                  <Ionicons name="chevron-forward" size={14} color={HUB.accent} />
                </View>
              </>
            ) : (
              <View style={styles.hubUpgradeBtn}>
                <Text style={styles.hubUpgradeBtnText}>Start free trial</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingBottom: Spacing['3xl'],
    },
    padded: {
      paddingHorizontal: Spacing.base,
    },

    // Profile header
    profileHeader: {
      alignItems: 'center',
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing.xl,
      gap: Spacing.xs,
    },
    name: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginTop: Spacing.lg,
    },
    username: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    ratingText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    noReviews: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    badgeRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
      marginTop: 4,
    },
    badgePill: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    badgePillText: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
    },
    editBtn: {
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
    },
    editBtnText: {
      ...Typography.label,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },

    // Quick actions
    quickActions: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['2xl'],
      paddingHorizontal: Spacing.base,
    },
    quickAction: {
      alignItems: 'center',
      gap: Spacing.xs,
      flex: 1,
    },
    quickActionIcon: {
      width: 52,
      height: 52,
      borderRadius: 52 / 2,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },

    // Dukanoh Pro entry card
    hubCard: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
      backgroundColor: HUB.background,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      borderColor: HUB.border,
      padding: Spacing.lg,
      gap: Spacing.md,
    },
    hubCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hubCardTitle: {
      ...Typography.subheading,
      color: HUB.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    proBadge: {
      backgroundColor: HUB.accent,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    proBadgeText: {
      ...Typography.caption,
      color: HUB.background,
      fontFamily: FontFamily.semibold,
    },
    hubMetrics: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    hubMetric: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    hubMetricValue: {
      ...Typography.subheading,
      color: HUB.accent,
      fontFamily: FontFamily.bold,
    },
    hubMetricLabel: {
      ...Typography.caption,
      color: HUB.textSecondary,
    },
    hubMetricDivider: {
      width: 1,
      height: 32,
      backgroundColor: HUB.border,
    },
    hubCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    hubCardFooterText: {
      ...Typography.caption,
      color: HUB.accent,
      fontFamily: FontFamily.medium,
    },
    hubFeatureList: {
      gap: Spacing.sm,
    },
    hubFeatureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    hubFeatureIconWrap: {
      width: 26,
      height: 26,
      borderRadius: BorderRadius.small,
      backgroundColor: proColors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hubFeatureLabel: {
      ...Typography.caption,
      color: HUB.textPrimary,
      flex: 1,
    },
    hubUpgradeBtn: {
      backgroundColor: HUB.accent,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
    },
    hubUpgradeBtnText: {
      ...Typography.label,
      color: HUB.background,
      fontFamily: FontFamily.semibold,
    },
  });
}
