import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { CelebrationView } from '@/components/CelebrationView';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { edgeFetch } from '@/lib/edgeFetch';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const BENEFITS: { icon: IoniconsName; title: string; body: string }[] = [
  {
    icon: 'shield-checkmark-outline',
    title: 'Verified badge',
    body: 'A blue ✓ badge on your profile and listings so buyers know you\'re trusted.',
  },
  {
    icon: 'wallet-outline',
    title: 'Get paid',
    body: 'Earnings land in your wallet. Withdraw to your bank whenever you\'re ready.',
  },
  {
    icon: 'diamond-outline',
    title: 'Unlock Dukanoh Pro',
    body: 'Verification is required before you can subscribe to Pro.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Secure & private',
    body: 'Your ID and bank details are handled securely. Dukanoh never stores them.',
  },
];

const NEEDS = [
  'A photo ID — passport or driving licence',
  'Your bank account details for payouts',
];

export default function StripeOnboardingScreen() {
  const { user, isVerified, refreshProfile } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);

  const handleStartOnboarding = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await edgeFetch('stripe-connect-onboard');

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Something went wrong', err?.error ?? 'Could not start verification. Please try again.');
        setLoading(false);
        return;
      }

      const { url } = await res.json();
      const sub = Linking.addEventListener('url', ({ url: deepLink }) => {
        if (deepLink.startsWith('dukanoh://stripe-onboarding')) {
          WebBrowser.dismissBrowser();
          sub.remove();
        }
      });
      await WebBrowser.openBrowserAsync(url);
      sub.remove();

      const statusRes = await edgeFetch('stripe-connect-status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.complete) {
          await refreshProfile();
        }
      }
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Verified state ──────────────────────────────────────────────────────────
  if (isVerified) {
    return (
      <ScreenWrapper>
        <Header title="Dukanoh Verify" />
        <CelebrationView
          icon="shield-checkmark"
          title="You're a verified seller"
          subtitle="Your identity is confirmed and your listings are now live to buyers. Welcome to Dukanoh."
          iconColor={colors.success}
          actions={[{ label: 'Start selling', onPress: () => router.replace('/(tabs)/sell') }]}
        />
      </ScreenWrapper>
    );
  }

  // ── Unverified state ────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <Header title="Dukanoh Verify" showBack />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primaryLight }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Become Verified</Text>
          <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
            A quick identity check — takes a few minutes and unlocks selling, payments, and your verified badge.
          </Text>
        </View>

        {/* Benefits */}
        <View style={[styles.benefitsBox, { backgroundColor: colors.surface }]}>
          {BENEFITS.map((b, i) => (
            <View
              key={b.title}
              style={[
                styles.benefitRow,
                i < BENEFITS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={b.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.benefitText}>
                <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>{b.title}</Text>
                <Text style={[styles.benefitBody, { color: colors.textSecondary }]}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* What you'll need */}
        <View style={[styles.needsBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>What you'll need</Text>
          {NEEDS.map(item => (
            <View key={item} style={styles.needsRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={[styles.needsText, { color: colors.textSecondary }]}>{item}</Text>
            </View>
          ))}
        </View>

        <Button
          label="Start verification"
          onPress={handleStartOnboarding}
          loading={loading}
        />

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          Your data is encrypted and handled securely. Dukanoh does not store your ID or bank details.
        </Text>
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.base,
    },
    hero: {
      borderRadius: BorderRadius.large,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.md,
    },
    heroIconWrap: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontSize: 22,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    heroBody: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 20,
    },
    benefitsBox: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      padding: Spacing.base,
    },
    benefitIcon: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    benefitText: {
      flex: 1,
      gap: 3,
      paddingTop: 2,
    },
    benefitTitle: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    benefitBody: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    needsBox: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    needsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    needsText: {
      flex: 1,
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    disclaimer: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 17,
    },
  });
}
