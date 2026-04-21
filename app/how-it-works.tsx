import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface Step {
  icon: IoniconsName;
  title: string;
  description: string;
}

interface Tip {
  icon: IoniconsName;
  text: string;
}

const STEPS: Step[] = [
  {
    icon: 'search-outline',
    title: 'Discover',
    description: 'Rare pieces from verified members across the community — festive, formal, casual, and everything in between.',
  },
  {
    icon: 'chatbubble-outline',
    title: 'Message',
    description: 'Message any member directly. Ask about condition, measurements, or make an offer.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Pay securely',
    description: 'Every order includes Dukanoh Safe Checkout. Payment is held until you confirm your piece has arrived — or released automatically 48 hours after delivery.',
  },
  {
    icon: 'star-outline',
    title: 'Review',
    description: 'Rate the transaction once it\'s done. Reviews build trust across the community.',
  },
];

const BUYER_TIPS: Tip[] = [
  {
    icon: 'shield-checkmark-outline',
    text: 'Dukanoh Safe Checkout covers orders up to £1,000. If a piece doesn\'t arrive or doesn\'t match the listing, raise a dispute and our team will step in.',
  },
  {
    icon: 'eye-outline',
    text: 'Check the photos carefully and message the seller before committing.',
  },
  {
    icon: 'star-half-outline',
    text: 'Review the member\'s ratings and past transactions before buying.',
  },
  {
    icon: 'checkmark-circle-outline',
    text: 'Confirm receipt once your piece arrives. This releases payment to the seller and opens a 48-hour window to raise any issues.',
  },
  {
    icon: 'alert-circle-outline',
    text: 'Raise a dispute within 48 hours of delivery if something\'s wrong. Our team reviews all claims within 7 days.',
  },
];

const SELLER_TIPS: Tip[] = [
  {
    icon: 'camera-outline',
    text: 'Clear, well-lit photos from multiple angles. Great photos move pieces faster.',
  },
  {
    icon: 'pricetag-outline',
    text: 'Price by research — check what similar pieces have sold for on Dukanoh.',
  },
  {
    icon: 'chatbubbles-outline',
    text: 'Reply quickly. Members buy from sellers they trust.',
  },
  {
    icon: 'cube-outline',
    text: 'Be honest about condition. List any flaws — it builds your reputation.',
  },
  {
    icon: 'cube-outline',
    text: 'Dispatch within 5 days of a sale. Orders not shipped in time are automatically cancelled and the buyer refunded.',
  },
];

export default function HowItWorksScreen() {
  const { isSeller } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <ScreenWrapper>
      <Header title="How Dukanoh Works" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Steps */}
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.stepCard}>
            <View style={styles.stepIconWrapper}>
              <Ionicons name={step.icon} size={28} color={colors.primary} />
            </View>
            <View style={styles.stepContent}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        ))}

        <Divider style={styles.sectionDivider} />

        {/* Payments info */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <Text style={styles.infoText}>
            Every order on Dukanoh includes Dukanoh Safe Checkout. Payments are held by Stripe and only released to the seller once you confirm your piece has arrived, or automatically 48 hours after delivery if you take no action.
          </Text>
        </View>

        <Divider style={styles.sectionDivider} />

        {/* Buyer tips */}
        <Text style={styles.sectionTitle}>Buying on Dukanoh</Text>
        <Text style={styles.sectionSubtitle}>What to know before you purchase</Text>
        {BUYER_TIPS.map((tip) => (
          <View key={tip.text} style={styles.tipRow}>
            <Ionicons name={tip.icon} size={20} color={colors.primary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}

        <Divider style={styles.sectionDivider} />

        {/* Seller tips */}
        <Text style={styles.sectionTitle}>Selling on Dukanoh</Text>
        <Text style={styles.sectionSubtitle}>How to make your listings work harder</Text>
        {SELLER_TIPS.map((tip) => (
          <View key={tip.text} style={styles.tipRow}>
            <Ionicons name={tip.icon} size={20} color={colors.primary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}

        {/* Seller CTA */}
        {!isSeller && (
          <>
            <Divider style={styles.sectionDivider} />
            <View style={styles.sellerCta}>
              <Text style={styles.sellerCtaTitle}>List your pieces.</Text>
              <Text style={styles.sellerCtaSubtitle}>
                Someone's been looking for them. Complete Dukanoh Verify to start receiving payments — it takes a few minutes.
              </Text>
              <Button
                label="Start selling"
                variant="primary"
                onPress={() => router.push('/stripe-onboarding')}
                style={styles.sellerCtaBtn}
              />
            </View>
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },

    // Steps
    stepCard: {
      flexDirection: 'row',
      gap: Spacing.base,
      paddingVertical: Spacing.md,
    },
    stepIconWrapper: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepContent: {
      flex: 1,
      gap: Spacing.xs,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    stepNumber: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: {
      fontSize: 12,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
    },
    stepTitle: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
      fontSize: 16,
    },
    stepDescription: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    // Divider
    sectionDivider: {
      marginVertical: Spacing.sm,
    },

    // Info card
    infoCard: {
      flexDirection: 'row',
      gap: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    infoText: {
      flex: 1,
      ...Typography.body,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 22,
    },

    // Section headers
    sectionTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    sectionSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      marginTop: -Spacing.sm,
    },

    // Tips
    tipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    tipText: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      lineHeight: 22,
    },

    // Seller CTA
    sellerCta: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.large,
      padding: Spacing.xl,
      gap: Spacing.sm,
    },
    sellerCtaTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    sellerCtaSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    sellerCtaBtn: {},
  });
}
