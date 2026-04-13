import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { BalanceCarousel, type BalanceData } from '@/components/pro/BalanceCarousel';
import { useProColors } from '@/hooks/useProColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { FontFamily, Spacing, BorderRadius, Typography, type ProColorTokens } from '@/constants/theme';

interface Analytics {
  totalViews: number;
  totalSaves: number;
  thisMonthEarned: number;
  activeListings: number;
  pendingOrders: number;
}

interface QuickLink {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
}

const STALE_MS = 30_000;

export function ProProfileTab() {
  const P = useProColors();
  const insets = useSafeAreaInsets();
  const { user, username, isVerified, sellerTier } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const styles = useMemo(() => getStyles(P), [P]);
  const lastFetchedRef = useRef<number>(0);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('full_name, avatar_url, rating_avg, rating_count')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setProfileName(data.full_name === 'New User' ? '' : (data.full_name ?? ''));
      setProfileAvatar(data.avatar_url ?? undefined);
      setRatingAvg(data.rating_avg ?? 0);
      setRatingCount(data.rating_count ?? 0);
    }
    lastFetchedRef.current = Date.now();
  }, [user]);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    setBalanceLoading(true);
    const { data } = await supabase
      .from('seller_wallet')
      .select('available_balance, pending_balance, lifetime_earned')
      .eq('seller_id', user.id)
      .maybeSingle();
    setBalance(
      data
        ? {
            available: data.available_balance ?? 0,
            pending: data.pending_balance ?? 0,
            lifetime: data.lifetime_earned ?? 0,
          }
        : { available: 0, pending: 0, lifetime: 0 }
    );
    setBalanceLoading(false);
  }, [user]);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setAnalyticsLoading(true);
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const [
      { count: viewCount },
      { data: savesData },
      { data: earnedData },
      { count: listingCount },
      { count: orderCount },
    ] = await Promise.all([
      supabase
        .from('listing_views')
        .select('listing_id, listings!inner(seller_id)', { count: 'exact', head: true })
        .eq('listings.seller_id', user.id),
      supabase
        .from('listings')
        .select('save_count')
        .eq('seller_id', user.id),
      supabase
        .from('transactions')
        .select('amount')
        .eq('seller_id', user.id)
        .gte('created_at', thisMonthStart.toISOString()),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('status', 'available'),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .in('status', ['paid', 'shipped']),
    ]);

    setAnalytics({
      totalViews: viewCount ?? 0,
      totalSaves: (savesData ?? []).reduce(
        (s: number, l: { save_count: number | null }) => s + (l.save_count ?? 0),
        0
      ),
      thisMonthEarned: (earnedData ?? []).reduce(
        (s: number, t: { amount: number | null }) => s + (t.amount ?? 0),
        0
      ),
      activeListings: listingCount ?? 0,
      pendingOrders: orderCount ?? 0,
    });
    setAnalyticsLoading(false);
  }, [user]);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchProfile(), fetchBalance(), fetchAnalytics()]);
  }, [fetchProfile, fetchBalance, fetchAnalytics]);

  useEffect(() => {
    if (Date.now() - lastFetchedRef.current > STALE_MS) {
      loadAll();
    }
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastFetchedRef.current = 0;
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const quickLinks: QuickLink[] = [
    {
      icon: 'bag-outline',
      label: 'Listings',
      badge: analytics?.activeListings ?? undefined,
      onPress: () => router.push('/listings?title=My+Listings&myListings=true'),
    },
    {
      icon: 'flash-outline',
      label: 'Boosts',
      onPress: () => router.push('/boosts'),
    },
    {
      icon: 'receipt-outline',
      label: 'Orders',
      badge: analytics?.pendingOrders || undefined,
      onPress: () => router.push('/orders'),
    },
    {
      icon: 'settings-outline',
      label: 'Settings',
      onPress: () => router.push('/settings'),
    },
  ];

  const displayName = profileName || `@${username}`;
  const isFounder = sellerTier === 'founder';

  return (
    <LinearGradient
      colors={[P.gradientTop, P.gradientBottom]}
      style={styles.root}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.primary} />
        }
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing['3xl'] }]}
      >
        {/* ── Business header: avatar left · name center · badges right ── */}
        <View style={styles.header}>
          {/* Avatar */}
          <TouchableOpacity onPress={() => router.push('/edit-profile')} hitSlop={8}>
            <Avatar uri={profileAvatar} initials={(displayName)[0]?.toUpperCase()} size="small" />
          </TouchableOpacity>

          {/* Name + username */}
          <View style={styles.headerCenter}>
            {profileName ? (
              <Text style={[styles.headerName, { color: P.textPrimary }]} numberOfLines={1}>
                {profileName}
              </Text>
            ) : null}
            <Text style={[styles.headerUsername, { color: P.textSecondary }]} numberOfLines={1}>
              @{username}
            </Text>
          </View>

          {/* Badge circles */}
          <View style={styles.headerRight}>
            {/* Pro / Founder badge */}
            <View style={[styles.badgeCircle, { backgroundColor: P.primary }]}>
              <Text style={[styles.badgeCircleText, { color: P.gradientBottom }]}>
                {isFounder ? 'F' : '◆'}
              </Text>
            </View>

            {/* Rating circle */}
            {ratingCount > 0 && (
              <View style={[styles.badgeCircle, { backgroundColor: P.surface, borderColor: P.border, borderWidth: 1 }]}>
                <Text style={[styles.badgeCircleRating, { color: P.primary }]}>
                  {ratingAvg.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Verified badge */}
        {isVerified && (
          <View style={styles.verifiedRow}>
            <View style={[styles.verifiedPill, { backgroundColor: P.surface, borderColor: P.border }]}>
              <Ionicons name="checkmark-circle" size={12} color={P.primary} />
              <Text style={[styles.verifiedText, { color: P.textSecondary }]}>
                {isFounder ? 'Founder · Verified Seller' : 'Dukanoh Pro · Verified Seller'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Balance carousel ── */}
        <View style={styles.carouselWrap}>
          <BalanceCarousel data={balance} loading={balanceLoading} P={P} />
        </View>

        {/* ── Quick links ── */}
        <View style={[styles.card, { backgroundColor: P.surface, borderColor: P.border }]}>
          <View style={styles.quickLinks}>
            {quickLinks.map(link => (
              <TouchableOpacity
                key={link.label}
                style={styles.quickLink}
                onPress={link.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.quickLinkIconWrap}>
                  <View style={[styles.quickLinkIcon, { backgroundColor: P.surfaceElevated }]}>
                    <Ionicons name={link.icon} size={22} color={P.primary} />
                  </View>
                  {!!link.badge && link.badge > 0 && (
                    <View style={[styles.badge, { backgroundColor: P.primary }]}>
                      <Text style={[styles.badgeText, { color: P.gradientBottom }]}>
                        {link.badge > 99 ? '99+' : link.badge}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.quickLinkLabel, { color: P.textPrimary }]}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Analytics cards ── */}
        <Text style={[styles.sectionTitle, { color: P.textSecondary }]}>This month</Text>
        <View style={styles.analyticsGrid}>
          <AnalyticCard
            label="Earned"
            value={analytics ? `£${analytics.thisMonthEarned.toFixed(0)}` : '—'}
            icon="trending-up-outline"
            loading={analyticsLoading}
            P={P}
          />
          <AnalyticCard
            label="Views"
            value={analytics ? String(analytics.totalViews) : '—'}
            icon="eye-outline"
            loading={analyticsLoading}
            P={P}
          />
          <AnalyticCard
            label="Saves"
            value={analytics ? String(analytics.totalSaves) : '—'}
            icon="heart-outline"
            loading={analyticsLoading}
            P={P}
          />
        </View>

        {/* ── Edit profile ── */}
        <TouchableOpacity
          style={[styles.editBtn, { borderColor: P.border }]}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={16} color={P.textSecondary} />
          <Text style={[styles.editBtnText, { color: P.textSecondary }]}>Edit profile</Text>
        </TouchableOpacity>

        {/* ── Seller hub link (full analytics) ── */}
        <TouchableOpacity
          style={[styles.hubLink, { backgroundColor: P.surface, borderColor: P.border }]}
          onPress={() => router.push('/seller-hub')}
          activeOpacity={0.8}
        >
          <Ionicons name="bar-chart-outline" size={18} color={P.primary} />
          <Text style={[styles.hubLinkText, { color: P.primary }]}>Full analytics dashboard</Text>
          <Ionicons name="chevron-forward" size={16} color={P.primary} />
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Analytic card ─────────────────────────────────────────────

interface AnalyticCardProps {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  loading: boolean;
  P: ProColorTokens;
}

function AnalyticCard({ label, value, icon, loading, P }: AnalyticCardProps) {
  return (
    <View style={[acStyles.card, { backgroundColor: P.surface, borderColor: P.border }]}>
      <Ionicons name={icon} size={18} color={P.textSecondary} />
      {loading ? (
        <ActivityIndicator size="small" color={P.primary} />
      ) : (
        <Text style={[acStyles.value, { color: P.textPrimary }]}>{value}</Text>
      )}
      <Text style={[acStyles.label, { color: P.textSecondary }]}>{label}</Text>
    </View>
  );
}

const acStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  value: {
    fontSize: 22,
    fontFamily: FontFamily.black,
    letterSpacing: -0.3,
  },
  label: {
    ...Typography.caption,
    fontFamily: FontFamily.medium,
  },
});

function getStyles(_P: ProColorTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: Spacing.xl,
      gap: Spacing.lg,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerName: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      lineHeight: 20,
    },
    headerUsername: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
    },
    headerRight: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    badgeCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeCircleText: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
    },
    badgeCircleRating: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
    },

    // Verified pill
    verifiedRow: {
      alignItems: 'flex-start',
    },
    verifiedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
    },
    verifiedText: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
    },

    // Balance carousel wrapper
    carouselWrap: {
      marginHorizontal: -Spacing.xl,
      paddingHorizontal: Spacing.xl,
    },

    // Quick links card
    card: {
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.xl,
    },
    quickLinks: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    quickLink: {
      alignItems: 'center',
      gap: Spacing.xs,
      flex: 1,
    },
    quickLinkIconWrap: {
      position: 'relative',
    },
    quickLinkIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
    },
    quickLinkLabel: {
      ...Typography.caption,
      fontFamily: FontFamily.medium,
    },

    // Analytics
    sectionTitle: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    analyticsGrid: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    // Edit profile button
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.sm,
    },
    editBtnText: {
      ...Typography.label,
      fontFamily: FontFamily.medium,
    },

    // Seller hub link
    hubLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.lg,
    },
    hubLinkText: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.medium,
    },
  });
}
