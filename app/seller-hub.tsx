import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Dimensions,
  Share,
  TextInput,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { Spacing, BorderRadius, FontFamily, Typography, proColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { HUB, HUB_FEATURES, HubListing, HubCollection, HubData } from '@/components/hub/hubTheme';
import { HubMetricTile } from '@/components/hub/HubMetricTile';
import { HubListingRow } from '@/components/hub/HubListingRow';
import { HubShareCard } from '@/components/hub/HubShareCard';
import { HubOccasionRow } from '@/components/hub/HubOccasionRow';

const SCREEN_WIDTH = Dimensions.get('window').width;


// ── Root screen: fetch tier and branch ──────────────────────
export default function SellerHubScreen() {
  const { user } = useAuth();
  const [sellerTier, setSellerTier] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [hadFreeTrial, setHadFreeTrial] = useState(false);
  const [accountStatus, setAccountStatus] = useState<'active' | 'warned' | 'suspended'>('active');
  const [strikeCount, setStrikeCount] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('seller_tier, is_verified, had_free_trial, account_status, cancellation_strike_count')
          .eq('id', user.id)
          .maybeSingle();
        if (error) { setLoadError(true); return; }
        setSellerTier(data?.seller_tier ?? 'free');
        setIsVerified(data?.is_verified ?? false);
        setHadFreeTrial(data?.had_free_trial ?? false);
        setAccountStatus(data?.account_status ?? 'active');
        setStrikeCount(data?.cancellation_strike_count ?? 0);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user]);

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Text style={{ color: HUB.textSecondary, fontFamily: FontFamily.regular, fontSize: 14 }}>
          Something went wrong. Please try again.
        </Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginTop: 16 }}>
          <Text style={{ color: HUB.accent, fontFamily: FontFamily.semibold, fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sellerTier === null) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator color={HUB.accent} />
      </View>
    );
  }

  if (sellerTier === 'pro' || sellerTier === 'founder') return <HubDashboard accountStatus={accountStatus} strikeCount={strikeCount} />;
  return <HubPaywall isVerified={isVerified} hadFreeTrial={hadFreeTrial} />;
}

// ── Paywall screen ───────────────────────────────────────────
// Core features shown in hero card — Pro ranking, Analytics, Boosts
const CORE_FEATURE_LABELS = [
  'Pro ranking — your listings shown higher',
  "Analytics & earnings — see what's working",
  '3 free boosts to the top of search every month',
];

function HubPaywall({ isVerified, hadFreeTrial }: { isVerified: boolean; hadFreeTrial: boolean }) {
  const insets = useSafeAreaInsets();
  const [founderCount, setFounderCount] = useState<number | null>(null);
  const [founderLimit, setFounderLimit] = useState(150);
  const [founderMonthlyPrice, setFounderMonthlyPrice] = useState('£6.99');
  const [standardMonthlyPrice, setStandardMonthlyPrice] = useState('£9.99');

  // "See all benefits" secondary CTA fades out once the user scrolls past it
  const seeAllOpacity = useRef(new Animated.Value(1)).current;
  const allFeaturesRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const allFeaturesY = useRef(0);

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['founder_count', 'founder_limit', 'founder_monthly_price', 'pro_monthly_price'])
      .then(({ data }) => {
        if (!data) return;
        const row = (k: string) => data.find(r => r.key === k)?.value;
        setFounderCount(parseInt(row('founder_count') ?? '0', 10));
        setFounderLimit(parseInt(row('founder_limit') ?? '150', 10));
        if (row('founder_monthly_price')) setFounderMonthlyPrice(`£${row('founder_monthly_price')}`);
        if (row('pro_monthly_price'))     setStandardMonthlyPrice(`£${row('pro_monthly_price')}`);
      });
  }, []);

  const isFounderAvailable = founderCount !== null && founderCount < founderLimit;
  const monthlyPrice       = isFounderAvailable ? founderMonthlyPrice : standardMonthlyPrice;

  const ctaLabel = !isVerified
    ? 'Get verified to unlock Pro'
    : hadFreeTrial ? 'Subscribe now' : 'Start 14-day free trial';

  const ctaNote = hadFreeTrial
    ? 'Cancel anytime. Billed via the App Store.'
    : isVerified
      ? 'Free for 14 days — no charge until your trial ends. Cancel anytime.'
      : null;

  const handleCta = () => {
    if (!isVerified) { router.back(); router.push('/stripe-onboarding'); return; }
    // RevenueCat Purchases.purchasePackage() goes here
  };

  const handleSeeAll = () => {
    scrollRef.current?.scrollTo({ y: allFeaturesY.current, animated: true });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    // Fade "See all" immediately from first scroll — opacity goes 1→0 over first 80px
    const opacity = Math.max(0, 1 - offsetY / 80);
    seeAllOpacity.setValue(opacity);
  };

  const coreFeatures = HUB_FEATURES.filter(f => CORE_FEATURE_LABELS.includes(f.label));
  const extraFeatures = HUB_FEATURES.filter(f => !CORE_FEATURE_LABELS.includes(f.label));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Fixed header: close left, logo centred via flex trick */}
      <View style={[styles.paywallHeader, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="close" size={22} color={HUB.textSecondary} />
        </TouchableOpacity>
        <DukanohLogo width={80} height={14} color={HUB.accent} />
        <View style={styles.closeBtnPlaceholder} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.paywallScroll, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* ── Subheading above card ── */}
        <Text style={styles.paywallSubheading}>Sell more. Know more. Earn more. On Pro.</Text>

        {/* ── Hero card ── */}
        <LinearGradient
          colors={[proColors.gradientEnd, proColors.gradientStart]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.paywallHero}
        >
          {/* Watermark logo — top-right, faint, oversized, rotated */}
          <View style={styles.paywallWatermark} pointerEvents="none">
            <DukanohLogo width={200} height={34} color={HUB.textPrimary} />
          </View>

          {/* Top section: plan name + price */}
          <View style={styles.paywallPlanLeft}>
            <Text style={styles.paywallPlanName}>Dukanoh Pro</Text>
            <View style={styles.paywallPriceRow}>
              <Text style={styles.paywallPrice}>{monthlyPrice}</Text>
              <Text style={styles.paywallPricePer}>/month</Text>
              {isFounderAvailable && (
                <LinearGradient
                  colors={[proColors.primary, proColors.primaryDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.founderBadge}
                >
                  <Text style={styles.founderBadgeText}>◆ Founder</Text>
                </LinearGradient>
              )}
            </View>
          </View>

          {/* Core features */}
          <View style={styles.heroFeatureList}>
            {coreFeatures.map(feature => (
              <View key={feature.label} style={styles.featureRow}>
                <Ionicons name={feature.icon} size={20} color={HUB.textSecondary} />
                <Text style={styles.featureLabel}>{feature.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* ── All other benefits (revealed on scroll) ── */}
        <View
          ref={allFeaturesRef}
          onLayout={e => { allFeaturesY.current = e.nativeEvent.layout.y; }}
          style={styles.featureList}
        >
          {extraFeatures.map(feature => (
            <View key={feature.label} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={feature.icon} size={18} color={HUB.accent} />
              </View>
              <Text style={styles.featureLabel}>{feature.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Sticky footer with fade gradient ── */}
      <LinearGradient
        colors={['transparent', HUB.background]}
        style={[styles.paywallFooter, { paddingBottom: insets.bottom + Spacing.lg }]}
        pointerEvents="box-none"
      >
        <Animated.View style={{ width: '100%', opacity: seeAllOpacity }} pointerEvents="box-none">
          <Button
            label={`See all ${HUB_FEATURES.length} benefits`}
            onPress={handleSeeAll}
            variant="outline"
            size="lg"
            style={{ width: '100%' }}
            backgroundColor={HUB.surface}
            textColor={HUB.textPrimary}
            borderColor={HUB.border}
          />
        </Animated.View>
        <Button
          label={ctaLabel}
          onPress={handleCta}
          size="lg"
          style={{ width: '100%' }}
          backgroundColor={HUB.accent}
          textColor={HUB.background}
        />
        {ctaNote && <Text style={styles.trialNote}>{ctaNote}</Text>}
      </LinearGradient>
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
  const [fetchError, setFetchError] = useState(false);
  const [createColVisible, setCreateColVisible] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [savingCol, setSavingCol] = useState(false);
  const [assignSheetListing, setAssignSheetListing] = useState<HubListing | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const shareCardRefs = useRef<Record<string, ViewShot | null>>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(false);

    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [txTotal, txThis, txLast, tx30d, listingsRes, profileViewsRes, collectionsRes] = await Promise.all([
        supabase.from('transactions').select('amount').eq('seller_id', user.id),
        supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', thisMonthStart),
        supabase.from('transactions').select('amount').eq('seller_id', user.id).gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
        supabase.from('transactions').select('amount, created_at').eq('seller_id', user.id).gte('created_at', last30Days),
        supabase.from('listings').select('id, title, price, images, status, view_count, save_count, occasion, collection_id').eq('seller_id', user.id).in('status', ['available', 'sold']).order('created_at', { ascending: false }),
        supabase.from('profile_views').select('id', { count: 'exact', head: true }).eq('profile_user_id', user.id).gte('viewed_at', last30Days),
        supabase.from('collections').select('id, name').eq('seller_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (txTotal.error || listingsRes.error || collectionsRes.error) {
        setFetchError(true);
        setLoading(false);
        return;
      }

      const totalEarned = (txTotal.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
      const thisMonthEarned = (txThis.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
      const lastMonthEarned = (txLast.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

      // Build 30-day chart data
      const buckets: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        buckets[d.toDateString()] = 0;
      }
      (tx30d.data ?? []).forEach(t => {
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
        (clData ?? []).forEach((r: { collection_id: string | null }) => {
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
        profileViews30d: profileViewsRes.count ?? 0,
        chartData,
        listings,
        collections,
        occasionPerformance,
      });
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);


  const handleCreateCollection = useCallback(async () => {
    if (!user || !newColName.trim()) return;
    setSavingCol(true);
    const { data: newCol } = await supabase
      .from('collections')
      .insert({ seller_id: user.id, name: newColName.trim() })
      .select('id, name')
      .single();
    setNewColName('');
    setCreateColVisible(false);
    setSavingCol(false);
    if (newCol) {
      setData(prev => prev ? {
        ...prev,
        collections: [{ id: newCol.id, name: newCol.name, listingCount: 0 }, ...prev.collections],
      } : prev);
    }
  }, [user, newColName]);

  const handleAssignCollection = useCallback(async (listingId: string, collectionId: string | null) => {
    await supabase.from('listings').update({ collection_id: collectionId }).eq('id', listingId);
    setAssignSheetListing(null);
    setData(prev => {
      if (!prev) return prev;
      const oldListing = prev.listings.find(l => l.id === listingId);
      const oldCollectionId = oldListing?.collection_id ?? null;
      const collections = prev.collections.map(c => {
        if (c.id === collectionId) return { ...c, listingCount: c.listingCount + 1 };
        if (c.id === oldCollectionId) return { ...c, listingCount: Math.max(0, c.listingCount - 1) };
        return c;
      });
      return { ...prev, collections };
    });
  }, []);

  const handleShare = async (listingId: string) => {
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
  };

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

      {fetchError ? (
        <View style={styles.dashLoading}>
          <Text style={{ color: HUB.textSecondary, fontFamily: FontFamily.regular, fontSize: 14 }}>
            Something went wrong. Please try again.
          </Text>
          <TouchableOpacity onPress={fetchData} hitSlop={12} style={{ marginTop: 16 }}>
            <Text style={{ color: HUB.accent, fontFamily: FontFamily.semibold, fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loading || !data ? (
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
          <LinearGradient colors={[proColors.gradientEnd, proColors.gradientStart]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.earningsCard}>
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
          </LinearGradient>

          {/* ── Performance metrics ── */}
          <View style={styles.metricsRow}>
            <HubMetricTile label="Listing Views" value={data.totalViews} icon="eye-outline" />
            <HubMetricTile label="Saves" value={data.totalSaves} icon="heart-outline" />
            <HubMetricTile label="Profile Views" value={data.profileViews30d} icon="person-outline" footnote="30d" />
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
                    <HubShareCard listing={listing} />
                  </ViewShot>
                  <HubListingRow
                    listing={listing}
                    onShare={handleShare}
                    sharing={sharingId === listing.id}
                    onAssign={() => setAssignSheetListing(listing)}
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
                <HubOccasionRow key={occasion} occasion={occasion} saves={saves} views={views} topSaves={data.occasionPerformance[0].saves} />
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
  paywallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: HUB.background,
  },
  closeBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  paywallScroll: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
  },
  paywallSubheading: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    color: HUB.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: -0.3,
    paddingVertical: Spacing.sm,
  },
  paywallHero: {
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    padding: Spacing.xl,
    gap: Spacing['2xl'],
    justifyContent: 'space-between',
  },
  paywallWatermark: {
    position: 'absolute',
    top: -10,
    right: -40,
    opacity: 0.06,
    transform: [{ rotate: '-15deg' }],
  },
  paywallPlanLeft: {
    gap: Spacing.xs,
  },
  paywallPlanName: {
    fontSize: 40,
    fontFamily: FontFamily.black,
    color: HUB.textPrimary,
    letterSpacing: -1,
    lineHeight: 44,
  },
  paywallPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  paywallPrice: {
    fontSize: 18,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
  },
  paywallPricePer: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
  },
  heroFeatureList: {
    gap: Spacing.lg,
  },
  featureList: {
    gap: Spacing.xl,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    backgroundColor: HUB.surface,
    padding: Spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.medium,
    backgroundColor: HUB.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureLabel: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
    flex: 1,
    lineHeight: 21,
  },
  paywallFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
    alignItems: 'center',
  },
  seeAllBtn: {
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: HUB.border,
    backgroundColor: HUB.surface,
  },
  seeAllBtnText: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
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
  gateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: `${HUB.accent}40`,
    backgroundColor: `${HUB.accent}15`,
    borderRadius: BorderRadius.large,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  gateBannerTitle: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
    marginBottom: 2,
  },
  gateBannerBody: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
    lineHeight: 17,
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
    fontFamily: FontFamily.semibold,
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
