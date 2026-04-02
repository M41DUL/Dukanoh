import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Spacing, BorderRadius, FontFamily, Typography } from '@/constants/theme';

// ── Seller Hub theme (always dark) ──────────────────────────
const HUB = {
  background: '#0A0A1A',
  surface: '#13132E',
  surfaceElevated: '#1C1C40',
  accent: '#C7A84F',
  accentSecondary: '#3735C5',
  textPrimary: '#F5F5F5',
  textSecondary: '#8888AA',
  border: '#2A2A50',
  positive: '#4ADE80',
} as const;

const FEATURES = [
  { icon: 'flash-outline' as const,      label: '3 free boosts every month' },
  { icon: 'bar-chart-outline' as const,  label: 'Analytics & earnings dashboard' },
  { icon: 'shield-checkmark-outline' as const, label: 'Pro seller badge' },
  { icon: 'folder-outline' as const,     label: 'Collections & archive' },
  { icon: 'share-social-outline' as const, label: 'Share kit for Instagram & WhatsApp' },
  { icon: 'pricetag-outline' as const,   label: 'Price drop alerts to saved buyers' },
];

function getTrialEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Paywall screen ───────────────────────────────────────────
export default function SellerHubScreen() {
  const insets = useSafeAreaInsets();

  // Animated values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoY = useRef(new Animated.Value(-20)).current;
  const headingOpacity = useRef(new Animated.Value(0)).current;
  const headingY = useRef(new Animated.Value(20)).current;
  const featureOpacities = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const featureYs = useRef(FEATURES.map(() => new Animated.Value(16))).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

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
      Animated.stagger(60, FEATURES.map((_, i) =>
        animIn(featureOpacities[i], featureYs[i])
      )),
      Animated.delay(40),
      animIn(ctaOpacity, ctaY),
    ]).start();
  }, []);

  const trialEndDate = useMemo(() => getTrialEndDate(), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Close button */}
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
        {/* Logo */}
        <Animated.View style={[styles.logoRow, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <DukanohLogo width={90} height={16} color={HUB.accent} />
        </Animated.View>

        {/* Heading */}
        <Animated.View style={[styles.headingBlock, { opacity: headingOpacity, transform: [{ translateY: headingY }] }]}>
          <View style={styles.proPill}>
            <Text style={styles.proPillText}>Pro ✦</Text>
          </View>
          <Text style={styles.heading}>Seller Hub</Text>
          <Text style={styles.subheading}>Sell more. Know more. Earn more.</Text>
        </Animated.View>

        {/* Feature list */}
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

        {/* CTA */}
        <Animated.View style={[styles.ctaBlock, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => {
              // RevenueCat purchase flow goes here
            }}
          >
            <Text style={styles.ctaBtnText}>Start 14-day free trial</Text>
          </TouchableOpacity>

          <Text style={styles.trialNote}>
            Free for 14 days, no charge until {trialEndDate},{'\n'}then £4.99/month — cancel anytime
          </Text>

          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.6}>
            <Text style={styles.maybeLater}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HUB.background,
  },
  closeBtn: {
    position: 'absolute',
    left: Spacing.base,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HUB.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
