import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
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
import { HUB, HUB_FEATURES, CORE_FEATURE_LABELS, HubListing, HubCollection, HubData } from '@/components/hub/hubTheme';
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
  const [proExpired, setProExpired] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('seller_tier, is_verified, had_free_trial, account_status, cancellation_strike_count, pro_expires_at')
          .eq('id', user.id)
          .maybeSingle();
        if (error) { setLoadError(true); return; }
        const tier = data?.seller_tier ?? 'free';
        // Treat as expired if pro/founder but pro_expires_at is in the past
        const expired = (tier === 'pro' || tier === 'founder')
          && !!data?.pro_expires_at
          && new Date(data.pro_expires_at) < new Date();
        setSellerTier(expired ? 'free' : tier);
        setProExpired(expired);
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
  return <HubPaywall isVerified={isVerified} hadFreeTrial={hadFreeTrial} proExpired={proExpired} />;
}

// ── Paywall screen ───────────────────────────────────────────

function HubPaywall({ isVerified, hadFreeTrial, proExpired }: { isVerified: boolean; hadFreeTrial: boolean; proExpired: boolean }) {
  const insets = useSafeAreaInsets();
  const [founderCount, setFounderCount] = useState<number | null>(null);
  const [founderLimit, setFounderLimit] = useState(150);
  const [founderMonthlyPrice, setFounderMonthlyPrice] = useState('£6.99');
  const [standardMonthlyPrice, setStandardMonthlyPrice] = useState('£9.99');

  // "See all benefits" secondary CTA fades out once the user scrolls past it
  const seeAllOpacity = useRef(new Animated.Value(1)).current;
  const [seeAllVisible, setSeeAllVisible] = useState(true);
  const allFeaturesRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const allFeaturesY = useRef(0);

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['founder_count', 'founder_limit', 'founder_monthly_price', 'pro_monthly_price'])
      .then(({ data, error }) => {
        if (error || !data) {
          // Fall back to defaults — paywall still usable, just shows standard pricing
          setFounderCount(founderLimit); // treat as full so founder card is hidden on error
          return;
        }
        const row = (k: string) => data.find(r => r.key === k)?.value;
        setFounderCount(parseInt(row('founder_count') ?? '0', 10));
        setFounderLimit(parseInt(row('founder_limit') ?? '150', 10));
        if (row('founder_monthly_price')) setFounderMonthlyPrice(`£${row('founder_monthly_price')}`);
        if (row('pro_monthly_price'))     setStandardMonthlyPrice(`£${row('pro_monthly_price')}`);
      });
  }, []);

  const isFounderAvailable = founderCount !== null && founderCount < founderLimit;
  const founderSlotsLeft   = founderLimit - (founderCount ?? 0);
  const monthlyPrice       = isFounderAvailable ? founderMonthlyPrice : standardMonthlyPrice;

  const ctaLabel = !isVerified
    ? 'Get verified to unlock Pro'
    : hadFreeTrial ? 'Subscribe now' : 'Start 14-day free trial';

  const ctaNote = !isVerified
    ? 'Verify your account first, then enjoy a 14-day free trial.'
    : hadFreeTrial
      ? 'Cancel anytime. Billed via the App Store.'
      : 'Free for 14 days. No charge until your trial ends. Cancel anytime.';

  const handleCta = () => {
    if (!isVerified) { router.back(); router.push('/stripe-onboarding'); return; }
    // RevenueCat Purchases.purchasePackage() goes here
  };

  const handleSeeAll = () => {
    scrollRef.current?.scrollTo({ y: allFeaturesY.current, animated: true });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const opacity = Math.max(0, 1 - offsetY / 80);
    seeAllOpacity.setValue(opacity);
    setSeeAllVisible(opacity > 0);
  };

  const coreFeatures = HUB_FEATURES.filter(f => (CORE_FEATURE_LABELS as readonly string[]).includes(f.label));
  const extraFeatures = HUB_FEATURES.filter(f => !(CORE_FEATURE_LABELS as readonly string[]).includes(f.label));

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
        {/* ── Expired subscription notice ── */}
        {proExpired && (
          <View style={styles.expiredBanner}>
            <Ionicons name="warning-outline" size={16} color={proColors.amber} />
            <Text style={styles.expiredBannerText}>Your Pro subscription has expired. Resubscribe to restore access.</Text>
          </View>
        )}

        {/* ── Subheading above card ── */}
        <Text style={styles.paywallSubheading}>Sell more. Know more. Earn more. On Dukanoh Pro.</Text>

        {/* ── Hero card ── */}
        <LinearGradient
          colors={[proColors.gradientEnd, proColors.gradientStart]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.paywallHero}
        >
          {/* Top section: plan name + price */}
          <View style={styles.paywallPlanLeft}>
            <Text style={styles.paywallPlanName}>Dukanoh Pro</Text>
            <View style={styles.paywallPriceRow}>
              <Text style={styles.paywallPrice}>{monthlyPrice}</Text>
              <Text style={styles.paywallPricePer}>/month</Text>
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

        {/* ── Founder progress / closed card ── */}
        {founderCount !== null && (
          <LinearGradient
            colors={[proColors.gradientEnd, proColors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.founderCard}
          >
            {isFounderAvailable ? (
              <>
                <View style={styles.founderCardHeader}>
                  <Text style={styles.founderCardTitle}>Founder pricing</Text>
                  <Text style={styles.founderCardCount}>
                    {founderLimit - founderSlotsLeft} of {founderLimit} spots taken
                  </Text>
                </View>
                <View style={styles.founderTrack}>
                  <View
                    style={[
                      styles.founderFill,
                      { width: `${((founderLimit - founderSlotsLeft) / founderLimit) * 100}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={styles.founderCardNote}>
                  Lock in {founderMonthlyPrice}/mo forever. Once these spots are gone, the price goes up to {standardMonthlyPrice} and stays there.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.founderCardHeader}>
                  <Text style={styles.founderCardTitle}>Founder pricing closed</Text>
                </View>
                <View style={styles.founderTrack}>
                  <View style={[styles.founderFill, { width: '100%' }]} />
                </View>
                <Text style={styles.founderCardNote}>
                  All {founderLimit} founder spots are taken. Standard pricing is {standardMonthlyPrice}/mo.
                </Text>
              </>
            )}
          </LinearGradient>
        )}

        {/* ── All other benefits (revealed on scroll) ── */}
        <View
          ref={allFeaturesRef}
          onLayout={e => { allFeaturesY.current = e.nativeEvent.layout.y; }}
        >
          <LinearGradient
            colors={[proColors.gradientEnd, proColors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featureList}
          >
            {extraFeatures.map(feature => (
              <View key={feature.label} style={styles.featureRow}>
                <Ionicons name={feature.icon} size={20} color={HUB.textSecondary} />
                <Text style={styles.featureLabel}>{feature.label}</Text>
              </View>
            ))}
          </LinearGradient>
        </View>
      </ScrollView>

      {/* ── Sticky footer with fade gradient ── */}
      <LinearGradient
        colors={['transparent', HUB.background]}
        style={[styles.paywallFooter, { paddingBottom: insets.bottom + Spacing.lg }]}
        pointerEvents="box-none"
      >
        <Animated.View style={{ width: '100%', opacity: seeAllOpacity }} pointerEvents={seeAllVisible ? 'box-none' : 'none'}>
          <Button
            label={`See +${extraFeatures.length} benefits`}
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
  const [bulkEditVisible, setBulkEditVisible] = useState(false);
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
        supabase.from('listings').select('id, title, price, images, status, view_count, save_count, occasion, collection_id').eq('seller_id', user.id).in('status', ['available', 'sold']).order('created_at', { ascending: false }).range(0, 49),
        supabase.from('profile_views').select('id', { count: 'exact', head: true }).eq('profile_user_id', user.id).gte('viewed_at', last30Days),
        supabase.from('collections').select('id, name').eq('seller_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (txTotal.error || txThis.error || txLast.error || tx30d.error || listingsRes.error || profileViewsRes.error || collectionsRes.error) {
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
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Listings</Text>
                <TouchableOpacity
                  style={styles.sectionAction}
                  onPress={() => setBulkEditVisible(true)}
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={18} color={HUB.accent} />
                  <Text style={styles.sectionActionText}>Edit prices</Text>
                </TouchableOpacity>
              </View>
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

      {/* ── Bulk Edit Prices sheet ── */}
      {data && (
        <BulkEditSheet
          visible={bulkEditVisible}
          listings={data.listings.filter(l => l.status === 'available')}
          onClose={() => setBulkEditVisible(false)}
          onSaved={() => { setBulkEditVisible(false); fetchData(); }}
        />
      )}

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


// ── Bulk Edit Sheet ──────────────────────────────────────────
const BULK_PRESETS = [
  { label: '−5%', value: 0.05 },
  { label: '−10%', value: 0.10 },
  { label: '−15%', value: 0.15 },
  { label: '−20%', value: 0.20 },
];

function BulkEditSheet({
  visible,
  listings,
  onClose,
  onSaved,
}: {
  visible: boolean;
  listings: HubListing[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      const initial: Record<string, string> = {};
      listings.forEach(l => { initial[l.id] = String(l.price); });
      setPrices(initial);
    }
  }, [visible, listings]);

  const changedIds = useMemo(
    () => listings.filter(l => {
      const val = parseFloat(prices[l.id] ?? '');
      return !isNaN(val) && val !== l.price;
    }).map(l => l.id),
    [listings, prices]
  );

  const applyPreset = useCallback((reduction: number) => {
    setPrices(prev => {
      const next = { ...prev };
      listings.forEach(l => {
        const reduced = Math.max(0.01, Math.round(l.price * (1 - reduction) * 100) / 100);
        next[l.id] = String(reduced);
      });
      return next;
    });
  }, [listings]);

  const handleClose = useCallback(() => {
    if (changedIds.length > 0) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved price changes.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  }, [changedIds.length, onClose]);

  const handleSave = useCallback(async () => {
    if (changedIds.length === 0 || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        changedIds.map(id => {
          const listing = listings.find(l => l.id === id)!;
          const newPrice = parseFloat(prices[id]);
          const isPriceDrop = newPrice < listing.price;
          const update: Record<string, unknown> = { price: newPrice };
          if (isPriceDrop) {
            update.original_price = listing.price;
            update.price_dropped_at = now;
          } else {
            update.original_price = null;
            update.price_dropped_at = null;
          }
          return supabase.from('listings').update(update).eq('id', id);
        })
      );
      onSaved();
    } catch {
      Alert.alert('Something went wrong', 'Could not save all price changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [changedIds, listings, prices, saving, onSaved]);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      backgroundColor={HUB.surface}
      handleColor={HUB.border}
      fullScreen
    >
      <View style={styles.bulkSheetContainer}>
        {/* Header */}
        <View style={styles.bulkSheetHeader}>
          <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={HUB.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Edit Prices</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Percentage presets */}
        <View style={styles.bulkPresetsRow}>
          {BULK_PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={styles.bulkPreset}
              onPress={() => applyPreset(p.value)}
              activeOpacity={0.75}
            >
              <Text style={styles.bulkPresetText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {listings.length === 0 ? (
          <View style={styles.bulkEmptyState}>
            <Ionicons name="pricetag-outline" size={32} color={HUB.textSecondary} />
            <Text style={styles.emptyStateText}>No active listings to edit.</Text>
          </View>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.bulkList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const currentVal = prices[item.id] ?? String(item.price);
              const parsedVal = parseFloat(currentVal);
              const changed = !isNaN(parsedVal) && parsedVal !== item.price;
              return (
                <View style={styles.bulkRow}>
                  <View style={styles.bulkRowInfo}>
                    <Text style={styles.bulkRowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.bulkRowOriginal}>was £{item.price.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.bulkInputWrap, changed && styles.bulkInputChanged]}>
                    <Text style={styles.bulkInputPrefix}>£</Text>
                    <TextInput
                      style={styles.bulkInput}
                      value={currentVal}
                      onChangeText={text => setPrices(prev => ({ ...prev, [item.id]: text }))}
                      keyboardType="decimal-pad"
                      placeholderTextColor={HUB.textSecondary}
                      underlineColorAndroid="transparent"
                      selectTextOnFocus
                    />
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Save button */}
        <View style={styles.bulkFooter}>
          <TouchableOpacity
            style={[styles.ctaBtn, changedIds.length === 0 && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={changedIds.length === 0 || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={HUB.background} />
              : <Text style={styles.ctaBtnText}>
                  {changedIds.length === 0 ? 'No changes' : `Save ${changedIds.length} change${changedIds.length === 1 ? '' : 's'}`}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
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
  paywallPlanLeft: {
    gap: Spacing.xs,
  },
  paywallPlanName: {
    fontSize: 26,
    fontFamily: FontFamily.black,
    color: HUB.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 32,
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
    gap: Spacing.xl,
  },
  featureList: {
    gap: Spacing['2xl'],
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
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

  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: proColors.amber + '1A',
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: proColors.amber + '40',
    padding: Spacing.md,
  },
  expiredBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: proColors.amber,
    lineHeight: 18,
  },
  founderCard: {
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    padding: Spacing.xl,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: proColors.primary + '40',
  },
  founderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  founderCardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },
  founderCardCount: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
  },
  founderTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: HUB.border,
    overflow: 'hidden',
  },
  founderFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: HUB.accent,
  },
  founderCardNote: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: HUB.textPrimary,
    lineHeight: 17,
  },
  founderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: HUB.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  founderBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: HUB.accent,
    letterSpacing: 0.2,
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

  // Bulk edit sheet
  bulkSheetContainer: {
    flex: 1,
    backgroundColor: HUB.surface,
  },
  bulkSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: HUB.border,
  },
  bulkPresetsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: HUB.border,
  },
  bulkPreset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: HUB.surfaceElevated,
    borderWidth: 1,
    borderColor: HUB.border,
  },
  bulkPresetText: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },
  bulkList: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  bulkEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: HUB.background,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.md,
  },
  bulkRowInfo: {
    flex: 1,
    gap: 2,
  },
  bulkRowTitle: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
    color: HUB.textPrimary,
  },
  bulkRowOriginal: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
  },
  bulkInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HUB.surfaceElevated,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: HUB.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minWidth: 90,
  },
  bulkInputChanged: {
    borderColor: HUB.accent,
    backgroundColor: HUB.accent + '15',
  },
  bulkInputPrefix: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textSecondary,
    marginRight: 2,
  },
  bulkInput: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
    minWidth: 60,
    textAlign: 'right',
    padding: 0,
  },
  bulkFooter: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: HUB.border,
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
