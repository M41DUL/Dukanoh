import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { ENTITLEMENT_ID } from '@/lib/revenuecat';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Button } from '@/components/Button';
import { CelebrationView } from '@/components/CelebrationView';
import { Spacing, BorderRadius, FontFamily, Typography, proColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { HUB, HUB_FEATURES, CORE_FEATURE_LABELS } from '@/components/hub/hubTheme';


// ── Root screen: fetch tier and branch ──────────────────────
export default function SellerHubScreen() {
  const { user, isVerified } = useAuth();
  const [sellerTier, setSellerTier] = useState<string | null>(null);
  const [hadFreeTrial, setHadFreeTrial] = useState(false);
  const [hadFounderSub, setHadFounderSub] = useState(false);
  const [proExpired, setProExpired] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('seller_tier, had_free_trial, had_founder_subscription, pro_expires_at')
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
        setHadFreeTrial(data?.had_free_trial ?? false);
        setHadFounderSub(data?.had_founder_subscription ?? false);
      } catch {
        setLoadError(true);
      }
    })();
  }, [user]);

  // Pro/Founder dashboard has moved to the profile tab — dismiss this modal
  useEffect(() => {
    if (sellerTier === 'pro' || sellerTier === 'founder') router.dismiss();
  }, [sellerTier]);

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

  if (sellerTier === 'pro' || sellerTier === 'founder') return null;

  return <HubPaywall isVerified={isVerified} hadFreeTrial={hadFreeTrial} hadFounderSub={hadFounderSub} proExpired={proExpired} />;
}

// ── Paywall screen ───────────────────────────────────────────

function HubPaywall({ isVerified, hadFreeTrial, hadFounderSub, proExpired }: { isVerified: boolean; hadFreeTrial: boolean; hadFounderSub: boolean; proExpired: boolean }) {
  const insets = useSafeAreaInsets();
  const [founderCount, setFounderCount] = useState<number | null>(null);
  const [founderLimit, setFounderLimit] = useState(150);
  const [founderMonthlyPrice, setFounderMonthlyPrice] = useState('£6.99');
  const [standardMonthlyPrice, setStandardMonthlyPrice] = useState('£9.99');
  const [rcPackage, setRcPackage] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [coolingOffAck, setCoolingOffAck] = useState(false);

  useEffect(() => {
    Purchases.getOfferings().then(offerings => {
      const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0] ?? null;
      setRcPackage(pkg ?? null);
      if (pkg) {
        const price = pkg.product.priceString;
        setStandardMonthlyPrice(price);
        setFounderMonthlyPrice(price);
      }
    }).catch(() => {
      // fall back to hardcoded prices — paywall still usable
    });
  }, []);

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
  }, [founderLimit]);

  const isFounderAvailable = founderCount !== null && founderCount < founderLimit && !hadFounderSub;
  const founderSlotsLeft   = founderLimit - (founderCount ?? 0);
  const monthlyPrice       = isFounderAvailable ? founderMonthlyPrice : standardMonthlyPrice;

  const ctaLabel = !isVerified
    ? 'Get verified to unlock Pro'
    : hadFreeTrial ? 'Subscribe now' : 'Start 14-day free trial';

  const ctaNote = !isVerified
    ? 'Verify your account first, then enjoy a 14-day free trial.'
    : hadFreeTrial
      ? `Cancel anytime. Billed via the ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'}.`
      : 'Free for 14 days. No charge until your trial ends. Cancel anytime.';

  const handleCta = async () => {
    if (!isVerified) { router.dismiss(); router.push('/stripe-onboarding'); return; }
    if (!rcPackage) { Alert.alert('Could not load subscription', 'Pull up the paywall and try again. If the issue persists, restart the app.'); return; }
    try {
      setPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(rcPackage);
      const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] != null;
      if (isActive) {
        const expiryDate = customerInfo.entitlements.active[ENTITLEMENT_ID]?.expirationDate;
        await supabase.from('users').update({
          seller_tier: 'pro',
          pro_expires_at: expiryDate ?? null,
          had_free_trial: true,
        }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
        setShowCelebration(true);
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Something went wrong', 'Your subscription could not be processed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
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

  if (showCelebration) {
    return (
      <View style={[styles.container, { backgroundColor: '#0D0D0D' }]}>
        <StatusBar style="light" />
        <CelebrationView
          icon="diamond"
          title="You're now Pro"
          subtitle="Your Pro features are live. Head to your profile to see your analytics and manage your listings."
          iconColor="#C7F75E"
          textColor="#F5F5F5"
          subtitleColor="#9B9B9B"
          actions={[{ label: 'Go to profile', onPress: () => router.dismiss() }]}
        />
      </View>
    );
  }

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
            <Text style={styles.expiredBannerText}>Your Pro subscription has expired. Resubscribe below to restore your features.</Text>
          </View>
        )}

        {/* ── Subheading above card ── */}
        <Text style={styles.paywallSubheading}>The seller toolkit. Only on Dukanoh Pro.</Text>

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
      <View style={[styles.paywallFooter, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <LinearGradient
            colors={['transparent', HUB.background]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
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
        {isVerified && (
          <TouchableOpacity
            style={styles.coolingOffRow}
            onPress={() => setCoolingOffAck(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.coolingOffBox,
              { borderColor: coolingOffAck ? HUB.accent : HUB.border },
              coolingOffAck && { backgroundColor: HUB.accent },
            ]}>
              {coolingOffAck && <Ionicons name="checkmark" size={13} color={HUB.background} />}
            </View>
            <Text style={styles.coolingOffText}>
              I want immediate access and understand this waives my 14-day cancellation right.
            </Text>
          </TouchableOpacity>
        )}
        <Button
          label={purchasing ? 'Processing...' : ctaLabel}
          onPress={handleCta}
          size="lg"
          style={{ width: '100%' }}
          backgroundColor={HUB.accent}
          textColor={HUB.background}
          disabled={purchasing || (isVerified && !coolingOffAck)}
        />
        {ctaNote && <Text style={styles.trialNote}>{ctaNote}</Text>}
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
  coolingOffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    width: '100%',
  },
  coolingOffBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  coolingOffText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: HUB.textSecondary,
    lineHeight: 17,
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
