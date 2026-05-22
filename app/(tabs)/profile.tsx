import React, { useState, useCallback, useMemo, ComponentProps } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Share, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { ProPaywallSheet } from '@/components/pro/ProPaywallSheet';
import { ProProfileTab } from '@/components/pro/ProProfileTab';
import { WalletSheet } from '@/components/WalletSheet';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily, proColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useTaxStatus } from '@/hooks/useTaxStatus';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { queryKeys } from '@/lib/queryKeys';
import { TaxHoldBanner } from '@/components/TaxHoldBanner';
import { HUB, HUB_FEATURES, CORE_FEATURE_LABELS } from '@/components/hub/hubTheme';
import { consumePaywallOpen } from '@/lib/paywallTrigger';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface QuickAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
}


export default function ProfileScreen() {
  const { user, username, isSeller, isVerified, isOfficial, sellerTier, refreshProfile } = useAuth();
  const { taxStatus, reloadTaxStatus } = useTaxStatus(user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [walletVisible, setWalletVisible] = useState(false);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile.overview(user?.id),
    enabled: !!user?.id,
    queryFn: async ({ signal }) => {
      const [{ data: userRow, error: userErr }, { data: privateRow, error: privateErr }] = await Promise.all([
        supabase
          .from('users')
          .select('avatar_url, rating_avg, rating_count, had_free_trial, pro_expires_at')
          .eq('id', user!.id)
          .abortSignal(signal)
          .maybeSingle(),
        supabase
          .from('user_private')
          .select('full_name')
          .eq('user_id', user!.id)
          .abortSignal(signal)
          .maybeSingle(),
      ]);
      if (userErr) throw userErr;
      if (privateErr) throw privateErr;
      return (userRow || privateRow) ? { ...userRow, ...privateRow } : null;
    },
  });

  const pricingQuery = useQuery({
    queryKey: queryKeys.profile.pricing(),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['founder_count', 'founder_limit', 'founder_monthly_price', 'pro_monthly_price'])
        .abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileData = profileQuery.data;
  const profileName = profileData?.full_name === 'New User' ? '' : (profileData?.full_name ?? '');
  const profileAvatar = profileData?.avatar_url ?? undefined;
  const ratingAvg = profileData?.rating_avg ?? 0;
  const ratingCount = profileData?.rating_count ?? 0;
  const hadFreeTrial = profileData?.had_free_trial ?? false;
  const proExpired = useMemo(() => {
    if (!profileData?.pro_expires_at) return false;
    return new Date(profileData.pro_expires_at) < new Date();
  }, [profileData?.pro_expires_at]);

  const { proCardPrice, proFounderAvailable } = useMemo(() => {
    const rows = pricingQuery.data;
    if (!rows) return { proCardPrice: null as string | null, proFounderAvailable: false };
    const row = (k: string) => rows.find(r => r.key === k)?.value;
    const count = parseInt(row('founder_count') ?? '0', 10);
    const limit = parseInt(row('founder_limit') ?? '150', 10);
    const founderAvail = count < limit;
    return {
      proCardPrice: founderAvail
        ? `£${row('founder_monthly_price') ?? '6.99'}/month`
        : `£${row('pro_monthly_price') ?? '9.99'}/month`,
      proFounderAvailable: founderAvail,
    };
  }, [pricingQuery.data]);

  // Auto-open paywall if stripe-onboarding signalled it
  useFocusEffect(useCallback(() => {
    if (consumePaywallOpen()) {
      refreshProfile().then(() => setPaywallVisible(true));
    }
  }, [refreshProfile]));

  // Re-pull useAuth-backed flags + tax status whenever the tab regains focus.
  // Profile + pricing queries refetch via useRefreshOnFocus below.
  useFocusEffect(useCallback(() => {
    refreshProfile();
    reloadTaxStatus();
  }, [refreshProfile, reloadTaxStatus]));

  useRefreshOnFocus(profileQuery.refetch);
  useRefreshOnFocus(pricingQuery.refetch);

  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const quickActions: QuickAction[] = [
    { icon: 'bag-outline', label: 'My listings', onPress: () => router.push('/my-listings') },
    { icon: 'receipt-outline', label: 'Orders', onPress: () => router.push('/orders') },
    { icon: 'wallet-outline', label: 'Wallet', onPress: () => setWalletVisible(true) },
    { icon: 'heart-outline', label: 'Saved', onPress: () => router.push('/saved') },
  ];

  const handleInvite = useCallback(() => {
    Share.share({
      message: Platform.OS === 'android'
        ? "Dukanoh is where I discover and sell South Asian fashion. You'd love it. https://apps.apple.com/app/dukanoh/id6744942741"
        : "Dukanoh is where I discover and sell South Asian fashion. You'd love it.",
      url: 'https://apps.apple.com/app/dukanoh/id6744942741',
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfile(),
      reloadTaxStatus(),
      profileQuery.refetch(),
      pricingQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [refreshProfile, reloadTaxStatus, profileQuery, pricingQuery]);

  // Pro users get a dedicated business dashboard UI
  if (sellerTier === 'pro' || sellerTier === 'founder') {
    return <ProProfileTab />;
  }

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
          <View style={styles.usernameRow}>
            <Text style={styles.username}>@{username}</Text>
            {isOfficial && (
              <View style={[styles.badgePill, { backgroundColor: '#0D0D0D' }]}>
                <Text style={[styles.badgePillText, { color: '#FFFFFF' }]}>Official</Text>
              </View>
            )}
            {isVerified && (
              <View style={[styles.badgePill, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.badgePillText, { color: colors.primaryText }]}>✓ Verified</Text>
              </View>
            )}
          </View>
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

        {/* ── Tax hold banner ── */}
        <View style={styles.padded}>
          <TaxHoldBanner taxStatus={taxStatus} />
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

        {/* ── Dukanoh Pro entry card — sellers only (paywall handles verified gate internally) ── */}
        {isSeller && <TouchableOpacity
          style={styles.hubCard}
          onPress={() => setPaywallVisible(true)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[proColors.gradientEnd, proColors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hubCardGradient}
          >
            <View style={styles.hubCardHeader}>
              <Text style={styles.hubPlanName}>Dukanoh Pro</Text>
              {proExpired ? (
                <View style={styles.expiredPill}>
                  <Text style={styles.expiredPillText}>Expired</Text>
                </View>
              ) : isVerified && !hadFreeTrial ? (
                <View style={styles.trialPill}>
                  <Text style={styles.trialPillText}>14-day free trial</Text>
                </View>
              ) : !isVerified ? (
                <View style={styles.verifyPill}>
                  <Text style={styles.verifyPillText}>Verify to unlock</Text>
                </View>
              ) : null}
            </View>
            {proCardPrice !== null && isVerified && (
              <Text style={styles.hubCardPrice}>
                {proCardPrice}{proFounderAvailable && <Text style={styles.hubFounderSuffix}> for founders only</Text>}
              </Text>
            )}
            <Text style={styles.hubBenefitLine}>Built for serious sellers.</Text>
            <View style={styles.hubFeatureList}>
              {HUB_FEATURES.filter(f => (CORE_FEATURE_LABELS as readonly string[]).includes(f.label)).map(f => (
                <View key={f.label} style={styles.hubFeatureRow}>
                  <Ionicons name={f.icon} size={16} color={HUB.accent} />
                  <Text style={styles.hubFeatureLabel}>{f.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.hubMoreChip}>
              <Text style={styles.hubMoreText}>+{HUB_FEATURES.length - CORE_FEATURE_LABELS.length} more features</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>}

        {/* ── Invite friends card — buyers only ── */}
        {!isSeller && (
          <TouchableOpacity style={styles.inviteCard} onPress={handleInvite} activeOpacity={0.8}>
            <LinearGradient
              colors={[colors.primaryLight, colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Ionicons name="share-outline" size={36} color={colors.primary} />
            <Text style={styles.inviteCardTitle}>Spread the word.</Text>
            <Text style={styles.inviteCardSubtitle}>The best pieces sell fast. More members means more to discover. Share Dukanoh with anyone who knows their South Asian fashion.</Text>
          </TouchableOpacity>
        )}

        {/* ── Settings — secondary footer CTA ── */}
        <Button
          label="Settings"
          variant="outline"
          size="md"
          onPress={() => router.push('/settings')}
          style={styles.settingsFooter}
        />

      </ScrollView>

      <ProPaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={async () => { await Promise.all([refreshProfile(), profileQuery.refetch()]); }}
        isVerified={isVerified}
        hadFreeTrial={hadFreeTrial}
        userId={user?.id ?? ''}
      />
      <WalletSheet
        visible={walletVisible}
        onClose={() => setWalletVisible(false)}
      />
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
    usernameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: Spacing.xs,
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
      flexDirection: 'row' as const,
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
      ...FontFamily.semibold,
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
      paddingTop: Spacing.sm,
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
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: proColors.border,
    },
    hubCardGradient: {
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
      ...FontFamily.semibold,
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
      ...FontFamily.semibold,
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
      ...FontFamily.bold,
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
      ...FontFamily.medium,
    },
    hubPlanNameRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: Spacing.sm,
    },
    hubPlanName: {
      fontSize: 20,
      ...FontFamily.black,
      color: HUB.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 26,
    },
    expiredPill: {
      backgroundColor: '#F59E0B20',
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: '#F59E0B50',
    },
    expiredPillText: {
      fontSize: 11,
      ...FontFamily.semibold,
      color: '#F59E0B',
    },
    verifyPill: {
      backgroundColor: HUB.border,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: HUB.textSecondary + '50',
    },
    verifyPillText: {
      fontSize: 11,
      ...FontFamily.semibold,
      color: HUB.textSecondary,
    },
    trialPill: {
      backgroundColor: HUB.accent + '25',
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: HUB.accent,
    },
    trialPillText: {
      fontSize: 11,
      ...FontFamily.semibold,
      color: HUB.accent,
    },
    hubBenefitLine: {
      fontSize: 15,
      ...FontFamily.regular,
      color: HUB.textPrimary,
      lineHeight: 21,
    },
    hubCardPrice: {
      fontSize: 13,
      ...FontFamily.semibold,
      color: HUB.textSecondary,
    },
    hubFounderSuffix: {
      fontSize: 13,
      ...FontFamily.semibold,
      color: HUB.accent,
    },
    hubMoreChip: {
      borderWidth: 1,
      borderColor: HUB.accent + '60',
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      alignItems: 'center' as const,
      marginTop: Spacing.md,
    },
    hubFeatureList: {
      gap: Spacing.lg,
    },
    hubFeatureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    hubFeatureLabel: {
      fontSize: 13,
      ...FontFamily.semibold,
      color: HUB.textPrimary,
      flex: 1,
      lineHeight: 18,
    },
    hubMoreText: {
      fontSize: 13,
      ...FontFamily.semibold,
      color: HUB.accent,
    },
    inviteCard: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      paddingVertical: Spacing['2xl'],
      paddingHorizontal: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.md,
    },
    inviteCardTitle: {
      fontSize: 16,
      ...FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: 22,
      textAlign: 'center',
    },
    inviteCardSubtitle: {
      fontSize: 14,
      ...FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: 21,
      textAlign: 'center',
    },
    settingsFooter: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
    },
  });
}
