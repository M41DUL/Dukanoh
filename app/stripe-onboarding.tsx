import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
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

const UNLOCKED: { icon: IoniconsName; label: string }[] = [
  { icon: 'checkmark-circle-outline', label: 'Verified badge on your profile and listings' },
  { icon: 'wallet-outline', label: 'Payments enabled — earnings go to your wallet' },
  { icon: 'diamond-outline', label: 'Dukanoh Pro access unlocked' },
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

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.EXPO_PUBLIC_INTERNAL_API_KEY;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-connect-onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dukanoh-key': apiKey ?? '',
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Something went wrong', err?.error ?? 'Could not start verification. Please try again.');
        setLoading(false);
        return;
      }

      const { url } = await res.json();
      await WebBrowser.openBrowserAsync(url);

      const statusRes = await fetch(`${supabaseUrl}/functions/v1/stripe-connect-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dukanoh-key': apiKey ?? '',
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.complete) {
          await refreshProfile();
          router.replace('/(tabs)/profile');
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
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.statusCard, { backgroundColor: colors.success + '12', borderColor: colors.success + '30' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            </View>
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>You're verified</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              Your identity has been confirmed. You're all set to sell on Dukanoh.
            </Text>
          </View>

          <View style={[styles.unlockedBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>What's unlocked</Text>
            {UNLOCKED.map(item => (
              <View key={item.label} style={styles.unlockedRow}>
                <Ionicons name={item.icon} size={18} color={colors.success} />
                <Text style={[styles.unlockedText, { color: colors.textSecondary }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          <Button
            label="View profile"
            onPress={() => router.replace('/(tabs)/profile')}
          />
        </ScrollView>
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

    // ── Verified ──
    statusCard: {
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.md,
    },
    statusIconWrap: {
      width: 80,
      height: 80,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusTitle: {
      fontSize: 22,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    statusBody: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 20,
    },
    unlockedBox: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    unlockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    unlockedText: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      flex: 1,
    },

    // ── Unverified ──
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
