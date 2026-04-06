import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { DukanohLogo } from '@/components/DukanohLogo';
import { BottomSheet } from '@/components/BottomSheet';
import { Spacing, BorderRadius, FontFamily, Typography, proColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

// ── Dukanoh Pro theme — sourced from design system ───────────
const HUB = {
  background:    proColors.background,
  surface:       proColors.surface,
  surfaceElevated: proColors.surfaceAlt,
  accent:        proColors.primary,
  textPrimary:   proColors.textPrimary,
  textSecondary: proColors.textSecondary,
  border:        proColors.border,
  positive:      proColors.success,
} as const;

const FEATURES = [
  { icon: 'flash-outline' as const,               label: '3 free boosts every month' },
  { icon: 'bar-chart-outline' as const,            label: 'Analytics & earnings dashboard' },
  { icon: 'shield-checkmark-outline' as const,     label: 'Pro seller badge' },
  { icon: 'folder-outline' as const,               label: 'Collections & archive' },
  { icon: 'share-social-outline' as const,         label: 'Share kit for Instagram & WhatsApp' },
  { icon: 'pricetag-outline' as const,             label: 'Price drop alerts to saved buyers' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Types ────────────────────────────────────────────────────
interface HubListing {
  id: string;
  title: string;
  price: number;
  images: string[];
  status: string;
  is_boosted: boolean;
  boost_expires_at: string | null;
  view_count: number;
  save_count: number;
  occasion: string | null;
}

interface HubCollection {
  id: string;
  name: string;
  listingCount: number;
}

interface HubData {
  totalEarned: number;
  thisMonthEarned: number;
  lastMonthEarned: number;
  totalViews: number;
  totalSaves: number;
  profileViews30d: number;
  chartData: { value: number }[];
  listings: HubListing[];
  collections: HubCollection[];
  occasionPerformance: { occasion: string; saves: number; views: number }[];
}

// ── Root screen: fetch tier and branch ──────────────────────
export default function SellerHubScreen() {
  const { user } = useAuth();
  const [sellerTier, setSellerTier] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [listingCount, setListingCount] = useState(0);
  const [accountStatus, setAccountStatus] = useState<'active' | 'warned' | 'suspended'>('active');
  const [strikeCount, setStrikeCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('users').select('seller_tier, is_verified, account_status, cancellation_strike_count').eq('id', user.id).maybeSingle(),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', user.id).eq('status', 'available'),
    ]).then(([{ data }, { count }]) => {
      setSellerTier(data?.seller_tier ?? 'free');
      setIsVerified(data?.is_verified ?? false);
      setAccountStatus(data?.account_status ?? 'active');
      setStrikeCount(data?.cancellation_strike_count ?? 0);
      setListingCount(count ?? 0);
    });
  }, [user]);

  if (sellerTier === null) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator color={HUB.accent} />
      </View>
    );
  }

  if (sellerTier === 'pro') return <HubDashboard accountStatus={accountStatus} strikeCount={strikeCount} />;
  return <HubPaywall isVerified={isVerified} listingCount={listingCount} />;
}

// ── Paywall screen ───────────────────────────────────────────
function HubPaywall({ isVerified, listingCount }: { isVerified: boolean; listingCount: number }) {
  const insets = useSafeAreaInsets();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [founderCount, setFounderCount] = useState<number | null>(null);
  const [founderLimit, setFounderLimit] = useState(150);

  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const logoY          = useRef(new Animated.Value(-20)).current;
  const headingOpacity = useRef(new Animated.Value(0)).current;
  const headingY       = useRef(new Animated.Value(20)).current;
  const featureOpacities = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const featureYs        = useRef(FEATURES.map(() => new Animated.Value(16))).current;
  const ctaOpacity     = useRef(new Animated.Value(0)).current;
  const ctaY           = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['founder_count', 'founder_limit'])
      .then(({ data }) => {
        if (!data) return;
        const row = (k: string) => data.find(r => r.key === k)?.value;
        setFounderCount(parseInt(row('founder_count') ?? '0', 10));
        setFounderLimit(parseInt(row('founder_limit') ?? '150', 10));
      });
  }, []);

  useEffect(() => {
    const animIn = (opacity: Animated.Value, y: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);

    Animated.sequence([
      animIn(logoOpacity, logoY),
      Animated.delay(60),
      animIn(headingOpacity, headingY),
      Animated.delay(40),
      Animated.stagger(60, FEATURES.map((_, i) => animIn(featureOpacities[i], featureYs[i]))),
      Animated.delay(40),
      animIn(ctaOpacity, ctaY),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time entrance animation — animated values are stable refs

  const isFounderAvailable = founderCount !== null && founderCount < founderLimit;
  const founderSlotsLeft = founderLimit - (founderCount ?? 0);

  const monthlyPrice  = isFounderAvailable ? '£6.99' : '£9.99';
  const annualPrice   = isFounderAvailable ? '£59.99' : '£84.99';
  const annualMonthly = isFounderAvailable ? '£5.00' : '£7.08';
  const currentPrice  = billingPeriod === 'monthly' ? monthlyPrice : annualMonthly;

  // ── Prerequisite gate: not verified or no listings ───────
  const notReady = !isVerified || listingCount === 0;
  if (notReady) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + Spacing.md }]}
          onPress={() => router.back()}
          hitSlop={16}
        >
          <Ionicons name="close" size={22} color={HUB.textSecondary} />
        </TouchableOpacity>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing['3xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoRow}>
            <DukanohLogo width={90} height={16} color={HUB.accent} />
          </View>
          <View style={styles.headingBlock}>
            <View style={styles.proPill}>
              <Text style={styles.proPillText}>Pro ✦</Text>
            </View>
            <Text style={styles.heading}>Dukanoh Pro</Text>
          </View>
          <View style={styles.gateCard}>
            {!isVerified && (
              <View style={styles.gateRow}>
                <View style={[styles.gateIconWrap, styles.gateIconIncomplete]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={HUB.accent} />
                </View>
                <View style={styles.gateText}>
                  <Text style={styles.gateTitle}>Get Verified first</Text>
                  <Text style={styles.gateBody}>Complete Dukanoh Verify to unlock Pro and receive payments.</Text>
                </View>
              </View>
            )}
            {listingCount === 0 && (
              <View style={styles.gateRow}>
                <View style={[styles.gateIconWrap, styles.gateIconIncomplete]}>
                  <Ionicons name="bag-outline" size={20} color={HUB.accent} />
                </View>
                <View style={styles.gateText}>
                  <Text style={styles.gateTitle}>List at least one item</Text>
                  <Text style={styles.gateBody}>You need an active listing before subscribing to Pro.</Text>
                </View>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => { router.back(); router.push('/stripe-onboarding'); }}
          >
            <Text style={styles.ctaBtnText}>
              {!isVerified ? 'Set up Dukanoh Verify' : 'Add a listing'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.6}>
            <Text style={styles.maybeLater}>Maybe later</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + Spacing.md }]}
        onPress={() => router.back()}
        hitSlop={16}
      >
        <Ionicons name="close" size={22} color={HUB.textSecondary} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing['3xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.logoRow, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <DukanohLogo width={90} height={16} color={HUB.accent} />
        </Animated.View>

        <Animated.View style={[styles.headingBlock, { opacity: headingOpacity, transform: [{ translateY: headingY }] }]}>
          <View style={styles.proPill}>
            <Text style={styles.proPillText}>Pro ✦</Text>
          </View>
          <Text style={styles.heading}>Dukanoh Pro</Text>
          <Text style={styles.subheading}>Sell more. Know more. Earn more.</Text>
        </Animated.View>

        <View style={styles.featureList}>
          {FEATURES.map((feature, i) => (
            <Animated.View
              key={feature.label}
              style={[styles.featureRow, { opacity: featureOpacities[i], transform: [{ translateY: featureYs[i] }] }]}
            >
              <View style={styles.featureIconWrap}>
                <Ionicons name={feature.icon} size={18} color={HUB.accent} />
              </View>
              <Text style={styles.featureLabel}>{feature.label}</Text>
            </Animated.View>
          ))}
        </View>

        <Animated.View style={[styles.ctaBlock, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          {/* Billing period toggle */}
          <View style={styles.billingToggle}>
            <TouchableOpacity
              style={[styles.toggleOption, billingPeriod === 'monthly' && styles.toggleOptionActive]}
              onPress={() => setBillingPeriod('monthly')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, billingPeriod === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, billingPeriod === 'annual' && styles.toggleOptionActive]}
              onPress={() => setBillingPeriod('annual')}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, billingPeriod === 'annual' && styles.toggleTextActive]}>Annual</Text>
              <View style={styles.savePill}>
                <Text style={styles.savePillText}>Save 29%</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Pricing */}
          <View style={styles.pricingCard}>
            {isFounderAvailable && (
              <View style={styles.founderBadge}>
                <Text style={styles.founderBadgeText}>
                  Founder Plan · {founderSlotsLeft} of {founderLimit} spots left
                </Text>
              </View>
            )}
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>{currentPrice}</Text>
              <Text style={styles.pricePer}>/mo</Text>
            </View>
            {billingPeriod === 'annual' && (
              <Text style={styles.annualTotal}>
                Billed as {annualPrice}/year
              </Text>
            )}
            <Text style={styles.pricingNote}>
              {isFounderAvailable
                ? 'Lock in your price forever — it will never increase for you.'
                : 'Price will increase as Dukanoh grows.'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => {
              // RevenueCat Purchases.purchasePackage() goes here
            }}
          >
            <Text style={styles.ctaBtnText}>
              Subscribe {billingPeriod === 'annual' ? 'annually' : 'monthly'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.trialNote}>
            Cancel anytime. Billed via the App Store.
          </Text>

          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.6}>
            <Text style={styles.maybeLater}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── Pro dashboard ────────────────────────────────────────────
function HubDashboard({ accountStatus, strikeCount }: {
  accountStatus: 'active' | 'warned' | 'suspended';
  strikeCount: number;
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [boostingId, setBoostingId] = useState<string | null>(null);
  const [createColVisible, setCreateColVisible] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [savingCol, setSavingCol] = useState(false);
  const [assignSheetListing, setAssignSheetListing] = useState<HubListing | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const shareCardRefs = useRef<Record<string, ViewShot | null>>({});
  // Boost quota state
  const [boostsUsed, setBoostsUsed] = useState(0);
  const [boostsResetAt, setBoostsResetAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [txAll, txThis, txLast, listingsRes, profileViewsRes, collectionsRes, userRes] = await Promise.all([
      supabase.from('transactions').select('amount, created_at').eq('seller_id', user.id),
      supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', thisMonthStart),
      supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
      supabase.from('listings').select('id, title, price, images, status, is_boosted, boost_expires_at, view_count, save_count, occasion').eq('seller_id', user.id).in('status', ['available', 'sold']).order('created_at', { ascending: false }),
      supabase.from('profile_views').select('id', { count: 'exact', head: true }).eq('profile_user_id', user.id).gte('viewed_at', last30Days),
      supabase.from('collections').select('id, name').eq('seller_id', user.id).order('created_at', { ascending: false }),
      supabase.from('users').select('boosts_used, boosts_reset_at').eq('id', user.id).single(),
    ]);

    setBoostsUsed(userRes.data?.boosts_used ?? 0);
    setBoostsResetAt(userRes.data?.boosts_reset_at ?? null);

    const allTx = txAll.data ?? [];
    const totalEarned = allTx.reduce((s, t) => s + (t.amount ?? 0), 0);
    const thisMonthEarned = (txThis.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
    const lastMonthEarned = (txLast.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

    // Build 30-day chart data
    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets[d.toDateString()] = 0;
    }
    allTx.forEach(t => {
      const key = new Date(t.created_at).toDateString();
      if (key in buckets) buckets[key] += t.amount ?? 0;
    });
    const chartData = Object.values(buckets).map(v => ({ value: v }));

    const listings = (listingsRes.data ?? []) as HubListing[];
    const totalViews = listings.reduce((s, l) => s + (l.view_count ?? 0), 0);
    const totalSaves = listings.reduce((s, l) => s + (l.save_count ?? 0), 0);

    // Collection listing counts
    const collectionIds = (collectionsRes.data ?? []).map(c => c.id);
    const collectionCounts: Record<string, number> = {};
    if (collectionIds.length > 0) {
      const { data: clData } = await supabase
        .from('listings')
        .select('collection_id')
        .eq('seller_id', user.id)
        .in('collection_id', collectionIds);
      (clData ?? []).forEach((r: any) => {
        if (r.collection_id) collectionCounts[r.collection_id] = (collectionCounts[r.collection_id] ?? 0) + 1;
      });
    }
    const collections: HubCollection[] = (collectionsRes.data ?? []).map(c => ({
      id: c.id,
      name: c.name,
      listingCount: collectionCounts[c.id] ?? 0,
    }));

    // Occasion performance
    const tagMap: Record<string, { saves: number; views: number }> = {};
    listings.forEach(l => {
      if (!l.occasion) return;
      if (!tagMap[l.occasion]) tagMap[l.occasion] = { saves: 0, views: 0 };
      tagMap[l.occasion].saves += l.save_count ?? 0;
      tagMap[l.occasion].views += l.view_count ?? 0;
    });
    const occasionPerformance = Object.entries(tagMap)
      .map(([occasion, v]) => ({ occasion, ...v }))
      .sort((a, b) => b.saves - a.saves)
      .slice(0, 5);

    setData({
      totalEarned,
      thisMonthEarned,
      lastMonthEarned,
      totalViews,
      totalSaves,
      profileViews30d: (profileViewsRes as any).count ?? 0,
      chartData,
      listings,
      collections,
      occasionPerformance,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBoost = useCallback(async (listingId: string) => {
    if (!user || !data) return;
    const now = new Date();

    // Enforce simultaneous boost limit (Pro: 10, standard: 5 — dashboard is Pro-only, so 10)
    const activeBoostCount = data.listings.filter(
      l => l.is_boosted && l.boost_expires_at && new Date(l.boost_expires_at) > now
    ).length;
    if (activeBoostCount >= 10) {
      Alert.alert('Boost limit reached', 'You can have 10 active boosts at once. Wait for one to expire before boosting again.');
      return;
    }

    setBoostingId(listingId);

    // Check if free boost allowance needs resetting
    const resetAt = boostsResetAt ? new Date(boostsResetAt) : null;
    let currentUsed = boostsUsed;
    if (!resetAt || resetAt <= now) {
      const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('users').update({ boosts_used: 0, boosts_reset_at: nextReset }).eq('id', user.id);
      currentUsed = 0;
      setBoostsUsed(0);
      setBoostsResetAt(nextReset);
    }

    if (currentUsed < 3) {
      // Use free boost — deduct from allowance
      await supabase.from('users').update({ boosts_used: currentUsed + 1 }).eq('id', user.id);
      setBoostsUsed(currentUsed + 1);
    }
    // else: RevenueCat consumable purchase for £0.99 goes here before applying boost

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('listings').update({ is_boosted: true, boost_expires_at: expiresAt }).eq('id', listingId);
    await fetchData();
    setBoostingId(null);
  }, [user, data, boostsUsed, boostsResetAt, fetchData]);

  const handleCreateCollection = useCallback(async () => {
    if (!user || !newColName.trim()) return;
    setSavingCol(true);
    await supabase.from('collections').insert({ seller_id: user.id, name: newColName.trim() });
    setNewColName('');
    setCreateColVisible(false);
    setSavingCol(false);
    await fetchData();
  }, [user, newColName, fetchData]);

  const handleAssignCollection = useCallback(async (listingId: string, collectionId: string | null) => {
    await supabase.from('listings').update({ collection_id: collectionId }).eq('id', listingId);
    setAssignSheetListing(null);
    await fetchData();
  }, [fetchData]);

  const handleShare = useCallback(async (listingId: string) => {
    const ref = shareCardRefs.current[listingId];
    if (!ref) return;
    setSharingId(listingId);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 0.95 });
      await Share.share({ url: uri, message: 'Check this out on Dukanoh!' });
    } catch {
      // user cancelled or capture failed — silent
    } finally {
      setSharingId(null);
    }
  }, []);

  const chartWidth = SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - 2;

  const earningsDelta = data
    ? data.thisMonthEarned - data.lastMonthEarned
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.dashHeader, { paddingTop: Spacing.md }]}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={16}
        >
          <Ionicons name="close" size={22} color={HUB.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.dashTitle}>Dukanoh Pro</Text>
        <View style={styles.proPillSmall}>
          <Text style={styles.proPillSmallText}>Pro ✦</Text>
        </View>
      </View>

      {loading || !data ? (
        <View style={styles.dashLoading}>
          <ActivityIndicator color={HUB.accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.dashScroll, { paddingBottom: insets.bottom + Spacing['3xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Account status banner ── */}
          {accountStatus === 'suspended' && (
            <View style={[styles.strikeBanner, { backgroundColor: '#FF444420', borderColor: '#FF444440' }]}>
              <Ionicons name="ban-outline" size={18} color="#FF4444" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.strikeBannerTitle, { color: '#FF4444' }]}>Account suspended</Text>
                <Text style={[styles.strikeBannerBody, { color: HUB.textSecondary }]}>
                  Your account has been suspended after {strikeCount} cancelled orders. Contact support to appeal.
                </Text>
              </View>
            </View>
          )}
          {accountStatus === 'warned' && (
            <View style={[styles.strikeBanner, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B40' }]}>
              <Ionicons name="warning-outline" size={18} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.strikeBannerTitle, { color: '#F59E0B' }]}>Account warning</Text>
                <Text style={[styles.strikeBannerBody, { color: HUB.textSecondary }]}>
                  You have {strikeCount} cancellation strikes. Reaching 5 will suspend your account.
                </Text>
              </View>
            </View>
          )}

          {/* ── Earnings card ── */}
          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Total Earned</Text>
            <Text style={styles.earningsAmount}>£{data.totalEarned.toFixed(2)}</Text>

            <View style={styles.earningsRow}>
              <View style={styles.earningsPeriod}>
                <Text style={styles.earningsPeriodLabel}>This month</Text>
                <Text style={styles.earningsPeriodValue}>£{data.thisMonthEarned.toFixed(2)}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsPeriod}>
                <Text style={styles.earningsPeriodLabel}>Last month</Text>
                <Text style={styles.earningsPeriodValue}>£{data.lastMonthEarned.toFixed(2)}</Text>
              </View>
              {earningsDelta !== 0 && (
                <>
                  <View style={styles.earningsDivider} />
                  <View style={styles.earningsPeriod}>
                    <Text style={styles.earningsPeriodLabel}>vs last month</Text>
                    <Text style={[styles.earningsDelta, earningsDelta > 0 ? styles.deltaPositive : styles.deltaNegative]}>
                      {earningsDelta > 0 ? '+' : ''}£{earningsDelta.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* 30-day sparkline */}
            {data.chartData.some(d => d.value > 0) && (
              <View style={styles.chartWrap}>
                <LineChart
                  data={data.chartData}
                  width={chartWidth}
                  height={72}
                  color={HUB.accent}
                  thickness={2}
                  hideDataPoints
                  curved
                  areaChart
                  startFillColor={HUB.accent}
                  endFillColor={HUB.background}
                  startOpacity={0.25}
                  endOpacity={0}
                  hideAxesAndRules
                  hideYAxisText
                  xAxisLabelsHeight={0}
                  disableScroll
                  noOfSections={3}
                  yAxisLabelWidth={0}
                />
              </View>
            )}
          </View>

          {/* ── Performance metrics ── */}
          <View style={styles.metricsRow}>
            <MetricTile label="Listing Views" value={data.totalViews} icon="eye-outline" />
            <MetricTile label="Saves" value={data.totalSaves} icon="heart-outline" />
            <MetricTile label="Profile Views" value={data.profileViews30d} icon="person-outline" footnote="30d" />
          </View>

          {/* ── Listings ── */}
          {data.listings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Listings</Text>
              {data.listings.map(listing => (
                <View key={listing.id}>
                  {/* Hidden share card — captured by ViewShot */}
                  <ViewShot
                    ref={r => { shareCardRefs.current[listing.id] = r; }}
                    options={{ format: 'png', quality: 0.95 }}
                    style={styles.shareCardHidden}
                  >
                    <ShareCard listing={listing} />
                  </ViewShot>
                  <HubListingRow
                    listing={listing}
                    onBoost={handleBoost}
                    boosting={boostingId === listing.id}
                    onShare={handleShare}
                    sharing={sharingId === listing.id}
                    onAssign={() => setAssignSheetListing(listing)}
                    freeBoostsLeft={Math.max(0, 3 - boostsUsed)}
                  />
                </View>
              ))}
            </View>
          )}

          {/* ── Collections ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Collections</Text>
              <TouchableOpacity
                style={styles.sectionAction}
                onPress={() => setCreateColVisible(true)}
                hitSlop={8}
              >
                <Ionicons name="add" size={18} color={HUB.accent} />
                <Text style={styles.sectionActionText}>New</Text>
              </TouchableOpacity>
            </View>

            {data.collections.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-outline" size={28} color={HUB.textSecondary} />
                <Text style={styles.emptyStateText}>Group your listings into collections</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionsRow}>
                {data.collections.map(col => (
                  <TouchableOpacity key={col.id} style={styles.collectionPill} activeOpacity={0.75}>
                    <Text style={styles.collectionName}>{col.name}</Text>
                    <Text style={styles.collectionCount}>{col.listingCount}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ── Occasion performance ── */}
          {data.occasionPerformance.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Occasion Performance</Text>
              {data.occasionPerformance.map(({ occasion, saves, views }) => (
                <OccasionRow key={occasion} occasion={occasion} saves={saves} views={views} topSaves={data.occasionPerformance[0].saves} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Create Collection sheet ── */}
      <BottomSheet
        visible={createColVisible}
        onClose={() => { setCreateColVisible(false); setNewColName(''); }}
        backgroundColor={HUB.surface}
        handleColor={HUB.border}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>New Collection</Text>
          <TextInput
            style={styles.sheetInput}
            placeholder="e.g. Partywear, Festive Edits…"
            placeholderTextColor={HUB.textSecondary}
            value={newColName}
            onChangeText={setNewColName}
            underlineColorAndroid="transparent"
            autoFocus
            maxLength={40}
          />
          <TouchableOpacity
            style={[styles.ctaBtn, !newColName.trim() && { opacity: 0.4 }]}
            onPress={handleCreateCollection}
            disabled={!newColName.trim() || savingCol}
            activeOpacity={0.85}
          >
            {savingCol
              ? <ActivityIndicator color={HUB.background} />
              : <Text style={styles.ctaBtnText}>Create</Text>
            }
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Assign to Collection sheet ── */}
      <BottomSheet
        visible={assignSheetListing !== null}
        onClose={() => setAssignSheetListing(null)}
        backgroundColor={HUB.surface}
        handleColor={HUB.border}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Add to Collection</Text>
          {data && data.collections.length === 0 ? (
            <Text style={styles.sheetEmptyText}>No collections yet — create one first.</Text>
          ) : (
            <>
              {data?.collections.map(col => (
                <TouchableOpacity
                  key={col.id}
                  style={styles.sheetOption}
                  onPress={() => assignSheetListing && handleAssignCollection(assignSheetListing.id, col.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="folder-outline" size={18} color={HUB.accent} />
                  <Text style={styles.sheetOptionText}>{col.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.sheetOption, { marginTop: Spacing.sm }]}
                onPress={() => assignSheetListing && handleAssignCollection(assignSheetListing.id, null)}
                activeOpacity={0.75}
              >
                <Ionicons name="close-circle-outline" size={18} color={HUB.textSecondary} />
                <Text style={[styles.sheetOptionText, { color: HUB.textSecondary }]}>Remove from collection</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────

function MetricTile({ label, value, icon, footnote }: { label: string; value: number; icon: any; footnote?: string }) {
  return (
    <View style={styles.metricTile}>
      <Ionicons name={icon} size={18} color={HUB.accent} />
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}{footnote ? ` (${footnote})` : ''}</Text>
    </View>
  );
}

function HubListingRow({
  listing,
  onBoost,
  boosting,
  onShare,
  sharing,
  onAssign,
  freeBoostsLeft,
}: {
  listing: HubListing;
  onBoost: (id: string) => void;
  boosting: boolean;
  onShare: (id: string) => void;
  sharing: boolean;
  onAssign: () => void;
  freeBoostsLeft: number;
}) {
  const now = new Date();
  const isBoostedActive = listing.is_boosted &&
    listing.boost_expires_at != null &&
    new Date(listing.boost_expires_at) > now;

  const hoursLeft = isBoostedActive && listing.boost_expires_at != null
    ? Math.ceil((new Date(listing.boost_expires_at).getTime() - Date.now()) / 3_600_000)
    : 0;

  const boostLabel = isBoostedActive
    ? `⚡ Live · ${hoursLeft}h`
    : freeBoostsLeft > 0
      ? '⚡ Reach more buyers'
      : '⚡ Reach more buyers · £0.99';

  const imageUri = listing.images?.[0];

  return (
    <TouchableOpacity
      style={styles.listingRow}
      activeOpacity={0.8}
      onPress={() => router.push(`/listing/edit/${listing.id}`)}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.listingThumb} />
      ) : (
        <View style={[styles.listingThumb, styles.listingThumbPlaceholder]}>
          <Ionicons name="image-outline" size={16} color={HUB.textSecondary} />
        </View>
      )}

      <View style={styles.listingInfo}>
        <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.listingPrice}>£{listing.price.toFixed(0)}</Text>
        <View style={styles.listingStats}>
          <Ionicons name="eye-outline" size={12} color={HUB.textSecondary} />
          <Text style={styles.listingStatText}>{listing.view_count}</Text>
          <Ionicons name="heart-outline" size={12} color={HUB.textSecondary} style={{ marginLeft: 8 }} />
          <Text style={styles.listingStatText}>{listing.save_count}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.listingActions}>
        <TouchableOpacity
          style={[styles.boostBtn, isBoostedActive && styles.boostBtnActive]}
          onPress={() => !isBoostedActive && onBoost(listing.id)}
          disabled={boosting || isBoostedActive}
          hitSlop={8}
        >
          {boosting ? (
            <ActivityIndicator size="small" color={HUB.accent} />
          ) : (
            <Text style={[styles.boostBtnText, isBoostedActive && styles.boostBtnTextActive]}>
              {boostLabel}
            </Text>
          )}
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => onShare(listing.id)}
          disabled={sharing}
          hitSlop={8}
        >
          {sharing
            ? <ActivityIndicator size="small" color={HUB.textSecondary} />
            : <Ionicons name="share-social-outline" size={18} color={HUB.textSecondary} />
          }
        </TouchableOpacity>

        {/* Assign to collection */}
        <TouchableOpacity style={styles.iconBtn} onPress={onAssign} hitSlop={8}>
          <Ionicons name="folder-outline" size={18} color={HUB.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Share Card (off-screen, captured by ViewShot) ────────────
function ShareCard({ listing }: { listing: HubListing }) {
  const imageUri = listing.images?.[0];
  return (
    <View style={styles.shareCard}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.shareCardImage} />
      ) : (
        <View style={[styles.shareCardImage, { backgroundColor: HUB.surfaceElevated }]} />
      )}
      <View style={styles.shareCardBody}>
        <DukanohLogo width={72} height={13} color={HUB.accent} />
        <Text style={styles.shareCardTitle} numberOfLines={2}>{listing.title}</Text>
        <Text style={styles.shareCardPrice}>£{listing.price.toFixed(0)}</Text>
      </View>
    </View>
  );
}

function OccasionRow({ occasion, saves, views, topSaves }: { occasion: string; saves: number; views: number; topSaves: number }) {
  const barWidth = topSaves > 0 ? (saves / topSaves) * 100 : 0;
  return (
    <View style={styles.occasionRow}>
      <View style={styles.occasionMeta}>
        <Text style={styles.occasionName}>{occasion}</Text>
        <Text style={styles.occasionStats}>{saves} saves · {views} views</Text>
      </View>
      <View style={styles.occasionBarBg}>
        <View style={[styles.occasionBarFill, { width: `${barWidth}%` }]} />
      </View>
    </View>
  );
}

// ── Shared styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: HUB.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: HUB.background,
  },

  // ── Close button (shared) ──
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HUB.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Paywall ──
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'] + Spacing.lg,
    gap: Spacing.xl,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headingBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  proPill: {
    backgroundColor: HUB.accent,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  proPillText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    color: HUB.background,
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 36,
    fontFamily: FontFamily.black,
    color: HUB.textPrimary,
    letterSpacing: -0.5,
  },
  subheading: {
    ...Typography.body,
    color: HUB.textSecondary,
    textAlign: 'center',
  },
  featureList: {
    gap: Spacing.md,
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.medium,
    backgroundColor: HUB.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    ...Typography.body,
    color: HUB.textPrimary,
    flex: 1,
  },
  ctaBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  ctaBtn: {
    backgroundColor: HUB.accent,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  ctaBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: HUB.background,
    letterSpacing: 0.2,
  },
  trialNote: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  maybeLater: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textDecorationLine: 'underline',
  },

  // ── Paywall: billing toggle ──
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: HUB.border,
  },
  toggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  toggleOptionActive: {
    backgroundColor: HUB.accent,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: HUB.textSecondary,
  },
  toggleTextActive: {
    color: HUB.background,
  },
  savePill: {
    backgroundColor: HUB.surfaceElevated,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  savePillText: {
    fontSize: 10,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },

  // ── Paywall: pricing card ──
  pricingCard: {
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    width: '100%',
  },
  founderBadge: {
    backgroundColor: HUB.accent + '22',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  founderBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
    letterSpacing: 0.3,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  priceAmount: {
    fontSize: 40,
    fontFamily: FontFamily.black,
    color: HUB.textPrimary,
    lineHeight: 44,
  },
  pricePer: {
    fontSize: 16,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
    marginBottom: 6,
  },
  annualTotal: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
  },
  pricingNote: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },

  // ── Prerequisite gate ──
  gateCard: {
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  gateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gateIconIncomplete: {
    backgroundColor: HUB.surfaceElevated,
  },
  gateText: {
    flex: 1,
    gap: 4,
  },
  gateTitle: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
  },
  gateBody: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
    lineHeight: 18,
  },

  // ── Dashboard ──
  dashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dashTitle: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: 20,
    fontFamily: FontFamily.bold,
    color: HUB.textPrimary,
  },
  proPillSmall: {
    backgroundColor: HUB.accent,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  proPillSmallText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: HUB.background,
    letterSpacing: 0.4,
  },
  dashLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strikeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  strikeBannerTitle: {
    fontSize: 13,
    fontFamily: FontFamily.semiBold,
    marginBottom: 2,
  },
  strikeBannerBody: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    lineHeight: 17,
  },
  dashScroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.xl,
  },

  // Earnings card
  earningsCard: {
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  earningsLabel: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  earningsAmount: {
    fontSize: 40,
    fontFamily: FontFamily.black,
    color: HUB.accent,
    letterSpacing: -1,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  earningsPeriod: {
    flex: 1,
    gap: 2,
  },
  earningsPeriodLabel: {
    ...Typography.caption,
    color: HUB.textSecondary,
  },
  earningsPeriodValue: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.semibold,
  },
  earningsDivider: {
    width: 1,
    height: 28,
    backgroundColor: HUB.border,
  },
  earningsDelta: {
    ...Typography.body,
    fontFamily: FontFamily.semibold,
  },
  deltaPositive: {
    color: HUB.positive,
  },
  deltaNegative: {
    color: '#FF6B6B',
  },
  chartWrap: {
    marginTop: Spacing.xs,
    marginHorizontal: -Spacing.lg,
    marginBottom: -Spacing.lg,
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricTile: {
    flex: 1,
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    color: HUB.textPrimary,
    letterSpacing: -0.5,
  },
  metricLabel: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textAlign: 'center',
  },

  // Sections
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionActionText: {
    ...Typography.caption,
    color: HUB.accent,
    fontFamily: FontFamily.medium,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
  },
  emptyStateText: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textAlign: 'center',
  },

  // Listing rows
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.medium,
    backgroundColor: HUB.surfaceElevated,
  },
  listingThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: 2,
  },
  listingTitle: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
  },
  listingPrice: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  listingStatText: {
    ...Typography.caption,
    color: HUB.textSecondary,
    marginLeft: 3,
  },
  boostedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: HUB.accent,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  boostedBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: HUB.background,
  },
  boostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: HUB.accent,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    minWidth: 60,
    justifyContent: 'center',
  },
  boostBtnText: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },
  boostBtnActive: {
    backgroundColor: HUB.accent + '22',
    borderColor: HUB.accent + '44',
  },
  boostBtnTextActive: {
    color: HUB.accent,
  },

  // Collections
  collectionsRow: {
    gap: Spacing.sm,
    paddingBottom: 2,
  },
  collectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: HUB.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  collectionName: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
  },
  collectionCount: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },

  // Occasion performance
  occasionRow: {
    gap: Spacing.xs,
  },
  occasionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  occasionName: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
    textTransform: 'capitalize',
  },
  occasionStats: {
    ...Typography.caption,
    color: HUB.textSecondary,
  },
  occasionBarBg: {
    height: 4,
    backgroundColor: HUB.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  occasionBarFill: {
    height: '100%',
    backgroundColor: HUB.accent,
    borderRadius: 2,
  },

  // Listing row action group
  listingActions: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Create / Assign collection sheets
  sheetContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: HUB.textPrimary,
  },
  sheetInput: {
    backgroundColor: HUB.surfaceElevated,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: HUB.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: HUB.textPrimary,
  },
  sheetEmptyText: {
    ...Typography.body,
    color: HUB.textSecondary,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: HUB.border,
  },
  sheetOptionText: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
  },

  // Hidden share card container
  shareCardHidden: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },

  // Share card (visual content captured by ViewShot)
  shareCard: {
    width: 300,
    backgroundColor: HUB.background,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
  },
  shareCardImage: {
    width: 300,
    height: 360,
  },
  shareCardBody: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    backgroundColor: HUB.surface,
  },
  shareCardTitle: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
    marginTop: Spacing.xs,
  },
  shareCardPrice: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: HUB.accent,
  },
});
