import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily, Typography } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';

const BENEFITS = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Get Verified',
    body: 'A blue ✓ badge appears on your profile and listings so members know you\'re verified.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Receive payments',
    body: 'Payments from members go into your wallet and you withdraw to your bank whenever you\'re ready.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Secure & protected',
    body: 'Dukanoh Verify handles all card processing. We never store your bank details.',
  },
  {
    icon: 'star-outline' as const,
    title: 'Unlock Dukanoh Pro',
    body: 'Verification is required before you can subscribe to Dukanoh Pro.',
  },
];

const UNLOCKED = [
  { icon: 'checkmark-circle-outline' as const, label: '✓ Verified badge on your profile and listings' },
  { icon: 'wallet-outline' as const, label: 'Payments enabled — earnings go to your wallet' },
  { icon: 'diamond-outline' as const, label: 'Dukanoh Pro access unlocked' },
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

      // Open Stripe's hosted onboarding in the system browser
      await WebBrowser.openBrowserAsync(url);

      // When the browser closes, check if onboarding is now complete
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

  if (isVerified) {
    return (
      <ScreenWrapper>
        <Header title="Verification" />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Status */}
          <View style={[styles.statusCard, { backgroundColor: colors.success + '12', borderColor: colors.success + '30' }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={36} color={colors.success} />
            </View>
            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>You're verified</Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              Your identity and account have been confirmed. You're all set to sell on Dukanoh.
            </Text>
          </View>

          {/* What's unlocked */}
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

  return (
    <ScreenWrapper>
      <Header title="Get Verified" showBack />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primaryLight }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Become Verified
          </Text>
          <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
            A quick ID and bank account check — takes a few minutes and unlocks payments, Pro, and your verified badge.
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsList}>
          {BENEFITS.map(b => (
            <View key={b.title} style={[styles.benefitRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.benefitIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={b.icon} size={20} color={colors.primary} />
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
          <Text style={[styles.needsTitle, { color: colors.textPrimary }]}>What you'll need</Text>
          <View style={styles.needsList}>
            {['A government-issued photo ID (passport or driving licence)', 'Your bank account details for payouts'].map(item => (
              <View key={item} style={styles.needsRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.needsText, { color: colors.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <Button
          label="Start Dukanoh Verify"
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

    // ── Verified state ──
    statusCard: {
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.xl,
      alignItems: 'center',
      gap: Spacing.md,
    },
    statusIconWrap: {
      width: 72,
      height: 72,
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
      ...Typography.body,
      flex: 1,
    },
    manageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.base,
    },
    manageLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      flex: 1,
    },
    manageText: {
      gap: 2,
    },
    manageTitle: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    manageSub: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
    },
    comingSoonPill: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    comingSoonText: {
      fontSize: 11,
      fontFamily: FontFamily.medium,
    },

    // ── Unverified state ──
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
      fontSize: 20,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    heroBody: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 20,
    },
    benefitsList: {
      gap: Spacing.sm,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
    },
    benefitIcon: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    benefitText: {
      flex: 1,
      gap: 3,
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
    needsTitle: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    needsList: {
      gap: Spacing.sm,
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
