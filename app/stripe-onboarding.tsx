import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';

const BENEFITS = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Get Verified',
    body: 'A blue ✓ badge appears on your profile and listings so buyers know you\'re a trusted seller.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Receive payments',
    body: 'Payments from buyers go into your wallet and you withdraw to your bank whenever you\'re ready.',
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

export default function StripeOnboardingScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const isAlreadyVerified = (user as any)?.is_verified === true;

  const handleStartOnboarding = () => {
    // Dukanoh Verify onboarding redirect goes here when payment provider is wired.
    // For now: show a placeholder.
    alert('Dukanoh Verify will be available soon. Come back shortly!');
  };

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
            Verify your seller account
          </Text>
          <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
            Complete a quick ID and bank account check via Dukanoh Verify — takes just a few minutes and keeps your payments secure.
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

        {isAlreadyVerified ? (
          <View style={[styles.verifiedBanner, { backgroundColor: colors.success + '18' }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.verifiedText, { color: colors.success }]}>
              Your account is already verified
            </Text>
          </View>
        ) : (
          <Button
            label="Start Dukanoh Verify"
            onPress={handleStartOnboarding}
          />
        )}

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
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    heroBody: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
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
      fontFamily: 'Inter_600SemiBold',
    },
    benefitBody: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    needsBox: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    needsTitle: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
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
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    verifiedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderRadius: BorderRadius.medium,
      padding: Spacing.md,
    },
    verifiedText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    disclaimer: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      lineHeight: 17,
    },
  });
}
