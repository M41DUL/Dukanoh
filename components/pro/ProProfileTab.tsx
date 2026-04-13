import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCarousel, type BalanceData } from '@/components/pro/BalanceCarousel';
import { useProColors } from '@/hooks/useProColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getImageUrl } from '@/lib/imageUtils';
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
  const { user, username } = useAuth();

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
      onPress: () => router.push('/orders'),
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
      onPress: () => router.push('/seller-orders'),
    },
    {
      icon: 'settings-outline',
      label: 'Settings',
      onPress: () => router.push('/settings'),
    },
  ];

  const initials = (profileName || username)[0]?.toUpperCase() ?? '?';

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
        {/* ── Header: avatar left · name centre · rating right ── */}
        <View style={styles.headerRow}>
          {/* Left: avatar — 40px with gold Pro checkmark badge */}
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={() => router.push('/edit-profile')} hitSlop={8} style={styles.avatarWrap}>
              {profileAvatar ? (
                <Image
                  source={{ uri: getImageUrl(profileAvatar, 'avatar') }}
                  style={styles.avatarCircle}
                />
              ) : (
                <View style={[styles.avatarCircle, { backgroundColor: P.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarInitials, { color: P.gradientBottom }]}>{initials}</Text>
                </View>
              )}
              {/* Gold Pro checkmark badge */}
              <View style={[styles.proBadgeNotif, { backgroundColor: P.primary }]}>
                <Ionicons name="checkmark" size={9} color={P.gradientBottom} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Centre: name + username */}
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

          {/* Right: rating circle (or empty space to keep name centred) */}
          <View style={styles.headerSide}>
            {ratingCount > 0 && (
              <View style={[styles.badgeCircle, { backgroundColor: P.surface, borderColor: P.border, borderWidth: 1, alignSelf: 'flex-end' }]}>
                <Text style={[styles.badgeCircleRating, { color: P.primary }]}>
                  {ratingAvg.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Balance carousel ── */}
        <View style={styles.carouselWrap}>
          <BalanceCarousel data={balance} loading={balanceLoading} P={P} />
        </View>

        {/* ── Quick links — no card wrapper ── */}
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
                  <View style={[styles.notifBadge, { backgroundColor: P.primary }]}>
                    <Text style={[styles.notifBadgeText, { color: P.gradientBottom }]}>
                      {link.badge > 99 ? '99+' : link.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickLinkLabel, { color: P.textPrimary }]}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Analytics cards ── */}
        <Text style={[styles.sectionTitle, { color: P.textSecondary }]}>This month</Text>
        <View style={styles.analyticsGrid}>
          <AnalyticCard
            label="Earned"
            value={analytics ? `£${analytics.thisMonthEarned.toFixed(0)}` : '—'}
            loading={analyticsLoading}
            P={P}
          />
          <AnalyticCard
            label="Views"
            value={analytics ? String(analytics.totalViews) : '—'}
            loading={analyticsLoading}
            P={P}
          />
          <AnalyticCard
            label="Saves"
            value={analytics ? String(analytics.totalSaves) : '—'}
            loading={analyticsLoading}
            P={P}
          />
        </View>

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
  loading: boolean;
  P: ProColorTokens;
}

function AnalyticCard({ label, value, loading, P }: AnalyticCardProps) {
  return (
    <View style={[acStyles.card, { backgroundColor: P.surface }]}>
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
      paddingHorizontal: Spacing.base,
      gap: Spacing.lg,
    },

    // Header: 3-column layout keeps name truly centred
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    // Left and right sides are equal width — ensures centre column is centred
    headerSide: {
      width: 68,
    },
    avatarWrap: {
      position: 'relative',
      width: 40,
      height: 40,
    },
    avatarCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
    },
    avatarInitials: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    // Gold Pro checkmark — notification badge style (bottom-right of avatar)
    proBadgeNotif: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    headerName: {
      fontSize: 17,
      fontFamily: FontFamily.semibold,
      lineHeight: 22,
    },
    headerUsername: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
    },
    badgeCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeCircleRating: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
    },

    // Balance carousel wrapper — edge to edge within padding
    carouselWrap: {
      marginHorizontal: -Spacing.base,
      paddingHorizontal: Spacing.base,
    },

    // Quick links — no card, just the row
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
    notifBadge: {
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
    notifBadgeText: {
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
