import React, { useState, useCallback, useMemo, useRef, ComponentProps } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { TaxHoldBanner } from '@/components/TaxHoldBanner';
import { HUB, HUB_FEATURES, CORE_FEATURE_LABELS } from '@/components/hub/hubTheme';
import { consumePaywallOpen } from '@/lib/paywallTrigger';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface QuickAction {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
}

const STALE_MS = 30_000;


export default function ProfileScreen() {
  const { user, username, isVerified, isOfficial, sellerTier, refreshProfile } = useAuth();
  const { taxStatus, reloadTaxStatus } = useTaxStatus(user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [walletVisible, setWalletVisible] = useState(false);

  // Auto-open paywall if stripe-onboarding signalled it
  useFocusEffect(useCallback(() => {
    if (consumePaywallOpen()) {
      refreshProfile().then(() => setPaywallVisible(true));
    }
  }, [refreshProfile]));

  const quickActions: QuickAction[] = [
    { icon: 'bag-outline', label: 'My listings', onPress: () => router.push('/my-listings') },
    { icon: 'receipt-outline', label: 'Orders', onPress: () => router.push('/orders') },
    { icon: 'wallet-outline', label: 'Wallet', onPress: () => setWalletVisible(true) },
    { icon: 'heart-outline', label: 'Saved', onPress: () => router.push('/saved') },
  ];
  const [hadFreeTrial, setHadFreeTrial] = useState(false);
  const [proExpired, setProExpired] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const lastFetchedRef = useRef<number>(0);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('users')
      .select('full_name, avatar_url, rating_avg, rating_count, had_free_trial, pro_expires_at')
      .eq('id', user.id)
      .maybeSingle();
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
      setHadFreeTrial(data.had_free_trial ?? false);
      const expiresAt = data.pro_expires_at ? new Date(data.pro_expires_at) : null;
      setProExpired(expiresAt !== null && expiresAt < new Date());
    }
    lastFetchedRef.current = Date.now();
  }, [user]);

  useFocusEffect(useCallback(() => {
    refreshProfile();
    reloadTaxStatus();
    const now = Date.now();
    if (now - lastFetchedRef.current > STALE_MS) {
      fetchProfile();
    }
  }, [fetchProfile, refreshProfile, reloadTaxStatus]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchedRef.current = 0;
    await Promise.all([refreshProfile(), fetchProfile()]);
    setRefreshing(false);
  }, [fetchProfile, refreshProfile]);

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

        {/* ── Dukanoh Pro entry card ── */}
        <TouchableOpacity
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
              <Ionicons name="chevron-forward" size={18} color={HUB.textSecondary} />
            </View>
            <View style={styles.hubFeatureList}>
              {HUB_FEATURES.filter(f => (CORE_FEATURE_LABELS as readonly string[]).includes(f.label)).map(f => (
                <View key={f.label} style={styles.hubFeatureRow}>
                  <Ionicons name={f.icon} size={20} color={HUB.textSecondary} />
                  <Text style={styles.hubFeatureLabel}>{f.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.hubMoreText}>+{HUB_FEATURES.length - CORE_FEATURE_LABELS.length} more features</Text>
          </LinearGradient>
        </TouchableOpacity>

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
        onSuccess={async () => { lastFetchedRef.current = 0; await Promise.all([refreshProfile(), fetchProfile()]); }}
        isVerified={isVerified}
        hadFreeTrial={hadFreeTrial}
        proExpired={proExpired}
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
      padding: Spacing.xl,
      gap: Spacing.lg,
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
    hubPlanName: {
      fontSize: 20,
      fontFamily: FontFamily.black,
      color: HUB.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 26,
    },
    hubFeatureList: {
      gap: Spacing.xl,
    },
    hubFeatureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    hubFeatureLabel: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      color: HUB.textPrimary,
      flex: 1,
      lineHeight: 21,
    },
    hubMoreText: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: HUB.accent,
    },
    settingsFooter: {
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.xl,
    },
  });
}
