import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Spacing, BorderRadius, FontFamily, proColorsDark } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { ENTITLEMENT_ID } from '@/lib/revenuecat';
import { HUB_FEATURES, CORE_FEATURE_LABELS } from '@/components/hub/hubTheme';

// Paywall always uses the dark Pro palette — it's a premium destination
// regardless of the user's system theme preference.
const P = proColorsDark;

interface ProPaywallSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  isVerified: boolean;
  hadFreeTrial: boolean;
  proExpired: boolean;
}

export function ProPaywallSheet({
  visible,
  onClose,
  onSuccess,
  isVerified,
  hadFreeTrial,
  proExpired,
}: ProPaywallSheetProps) {
  const insets = useSafeAreaInsets();
  const [founderCount, setFounderCount] = useState<number | null>(null);
  const [founderLimit, setFounderLimit] = useState(150);
  const [founderMonthlyPrice, setFounderMonthlyPrice] = useState('£6.99');
  const [standardMonthlyPrice, setStandardMonthlyPrice] = useState('£9.99');
  const [founderPkg, setFounderPkg] = useState<PurchasesPackage | null>(null);
  const [standardPkg, setStandardPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    Purchases.getOfferings().then(offerings => {
      const founder = offerings.current?.availablePackages.find(p => p.identifier === 'founder_monthly') ?? null;
      const standard = offerings.current?.monthly ?? null;
      setFounderPkg(founder);
      setStandardPkg(standard);
      if (standard) setStandardMonthlyPrice(standard.product.priceString);
      if (founder) setFounderMonthlyPrice(founder.product.priceString);
    }).catch(() => {});
  }, []);

  const seeAllOpacity = useRef(new Animated.Value(1)).current;
  const [seeAllVisible, setSeeAllVisible] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const allFeaturesY = useRef(0);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['founder_count', 'founder_limit', 'founder_monthly_price', 'pro_monthly_price'])
      .then(({ data, error }) => {
        if (error || !data) {
          setFounderCount(founderLimit);
          return;
        }
        const row = (k: string) => data.find(r => r.key === k)?.value;
        setFounderCount(parseInt(row('founder_count') ?? '0', 10));
        setFounderLimit(parseInt(row('founder_limit') ?? '150', 10));
        if (row('founder_monthly_price')) setFounderMonthlyPrice(`£${row('founder_monthly_price')}`);
        if (row('pro_monthly_price')) setStandardMonthlyPrice(`£${row('pro_monthly_price')}`);
      });
  }, [visible, founderLimit]);

  const isFounderAvailable = founderCount !== null && founderCount < founderLimit;
  const founderSlotsLeft = founderLimit - (founderCount ?? 0);
  const monthlyPrice = isFounderAvailable ? founderMonthlyPrice : standardMonthlyPrice;

  const ctaLabel = !isVerified
    ? 'Get verified to unlock Pro'
    : hadFreeTrial ? 'Subscribe now' : 'Start 14-day free trial';

  const ctaNote = !isVerified
    ? 'Verify your account first, then enjoy a 14-day free trial.'
    : hadFreeTrial
      ? `Cancel anytime. Billed via the ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'}.`
      : 'Free for 14 days. No charge until your trial ends. Cancel anytime.';

  const handleCta = async () => {
    if (!isVerified) {
      onClose();
      router.push('/stripe-onboarding');
      return;
    }
    const pkgToUse = isFounderAvailable ? (founderPkg ?? standardPkg) : standardPkg;
    if (!pkgToUse) {
      Alert.alert('Could not load subscription', 'Please close and reopen this screen. If the issue persists, restart the app.');
      return;
    }
    try {
      setPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pkgToUse);
      const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] != null;
      if (isActive) {
        const expiryDate = customerInfo.entitlements.active[ENTITLEMENT_ID]?.expirationDate;
        await supabase.from('users').update({
          seller_tier: 'pro',
          pro_expires_at: expiryDate ?? null,
          had_free_trial: true,
        }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
        await onSuccess();
        onClose();
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

  const coreFeatures = HUB_FEATURES.filter(f =>
    (CORE_FEATURE_LABELS as readonly string[]).includes(f.label)
  );
  const extraFeatures = HUB_FEATURES.filter(f =>
    !(CORE_FEATURE_LABELS as readonly string[]).includes(f.label)
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      fullScreen
      useModal
      backgroundColor="transparent"
      handleColor="transparent"
    >
      {/* Full-screen gradient fills the sheet */}
      <LinearGradient
        colors={[P.gradientTop, P.gradientBottom]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Spacing.sm }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={22} color={P.textSecondary} />
        </TouchableOpacity>
        <DukanohLogo width={80} height={14} color={P.primary} />
        <View style={styles.closeBtnPlaceholder} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Expired notice */}
        {proExpired && (
          <View style={[styles.expiredBanner, { borderColor: P.amber + '40' }]}>
            <Ionicons name="warning-outline" size={16} color={P.amber} />
            <Text style={[styles.expiredBannerText, { color: P.amber }]}>
              Your Pro subscription has expired. Resubscribe to restore access.
            </Text>
          </View>
        )}

        <Text style={styles.subheading}>
          Sell more. Know more. Earn more. On Dukanoh Pro.
        </Text>

        {/* Hero card */}
        <View style={[styles.card, styles.heroCard]}>
          <Text style={styles.planName}>Dukanoh Pro</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{monthlyPrice}</Text>
            <Text style={styles.pricePer}>/month</Text>
          </View>
          <View style={styles.featureList}>
            {coreFeatures.map(f => (
              <View key={f.label} style={styles.featureRow}>
                <Ionicons name={f.icon} size={20} color={P.textSecondary} />
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Founder card */}
        {founderCount !== null && (
          <View style={[styles.card, { borderColor: P.primary + '40', borderWidth: 1 }]}>
            {isFounderAvailable ? (
              <>
                <View style={styles.founderHeader}>
                  <Text style={styles.founderTitle}>Founder pricing</Text>
                  <Text style={styles.founderCount}>
                    {founderLimit - founderSlotsLeft} of {founderLimit} spots taken
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackFill,
                      { width: `${((founderLimit - founderSlotsLeft) / founderLimit) * 100}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={styles.founderNote}>
                  Lock in {founderMonthlyPrice}/mo forever. Once these spots are gone, the price goes up to {standardMonthlyPrice} and stays there.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.founderHeader}>
                  <Text style={styles.founderTitle}>Founder pricing closed</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: '100%' }]} />
                </View>
                <Text style={styles.founderNote}>
                  All {founderLimit} founder spots are taken. Standard pricing is {standardMonthlyPrice}/mo.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Extra features card */}
        <View
          style={styles.card}
          onLayout={e => { allFeaturesY.current = e.nativeEvent.layout.y; }}
        >
          {extraFeatures.map(f => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={18} color={P.textSecondary} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <LinearGradient
        colors={['transparent', P.gradientBottom]}
        style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{ width: '100%', opacity: seeAllOpacity }}
          pointerEvents={seeAllVisible ? 'box-none' : 'none'}
        >
          <Button
            label={`See +${extraFeatures.length} benefits`}
            onPress={handleSeeAll}
            variant="outline"
            size="lg"
            style={{ width: '100%' }}
            backgroundColor={P.surface}
            textColor={P.textPrimary}
            borderColor={P.border}
          />
        </Animated.View>
        <Button
          label={purchasing ? 'Processing...' : ctaLabel}
          onPress={handleCta}
          size="lg"
          style={{ width: '100%' }}
          backgroundColor={P.primary}
          textColor={P.gradientBottom}
          disabled={purchasing}
        />
        {ctaNote ? <Text style={styles.trialNote}>{ctaNote}</Text> : null}
      </LinearGradient>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  scroll: {
    gap: Spacing.xl,
  },
  subheading: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    color: P.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: -0.3,
    paddingVertical: Spacing.sm,
  },
  card: {
    backgroundColor: P.surface,
    borderRadius: BorderRadius.large,
    padding: Spacing.xl,
    gap: Spacing.lg,
    overflow: 'hidden',
  },
  heroCard: {
    gap: Spacing['2xl'],
  },
  planName: {
    fontSize: 26,
    fontFamily: FontFamily.black,
    color: P.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  price: {
    fontSize: 18,
    fontFamily: FontFamily.regular,
    color: P.textSecondary,
  },
  pricePer: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: P.textSecondary,
  },
  featureList: {
    gap: Spacing.xl,
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
    backgroundColor: P.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureLabel: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: P.textPrimary,
    flex: 1,
    lineHeight: 21,
  },
  founderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  founderTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: P.primary,
  },
  founderCount: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: P.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: P.border,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: P.primary,
  },
  founderNote: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: P.textSecondary,
    lineHeight: 19,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: P.amber + '1A',
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    padding: Spacing.md,
  },
  expiredBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
    alignItems: 'center',
  },
  trialNote: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: P.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
