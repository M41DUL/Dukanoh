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
    description: 'Find exclusive pieces from verified members across the community.',
  },
  {
    icon: 'chatbubble-outline',
    title: 'Message',
    description: 'Chat with members, ask questions and make offers directly.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Pay securely',
    description: 'Checkout with built-in buyer protection. A small protection fee is added at checkout. Your payment is held in escrow until you confirm the piece has arrived.',
  },
  {
    icon: 'star-outline',
    title: 'Review',
    description: 'Leave a review after your purchase to build trust in the community.',
  },
];

const BUYER_TIPS: Tip[] = [
  {
    icon: 'shield-checkmark-outline',
    text: 'Every purchase includes built-in buyer protection. If a piece doesn\'t arrive or doesn\'t match the listing, we\'ve got you covered.',
  },
  {
    icon: 'eye-outline',
    text: 'Always check photos and ask questions before committing to a purchase.',
  },
  {
    icon: 'star-half-outline',
    text: 'Check the member\'s reviews and rating before buying.',
  },
  {
    icon: 'checkmark-circle-outline',
    text: 'Confirm receipt once your piece arrives to release payment to the seller.',
  },
  {
    icon: 'alert-circle-outline',
    text: 'If something doesn\'t feel right, raise a dispute and our team will step in.',
  },
];

const SELLER_TIPS: Tip[] = [
  {
    icon: 'camera-outline',
    text: 'Use clear, well-lit photos from multiple angles — great photos sell pieces faster.',
  },
  {
    icon: 'pricetag-outline',
    text: 'Price fairly — check similar pieces to stay competitive.',
  },
  {
    icon: 'chatbubbles-outline',
    text: 'Respond to messages quickly. A high response rate builds trust.',
  },
  {
    icon: 'cube-outline',
    text: 'Describe condition honestly — include any flaws or signs of wear.',
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
            Every purchase on Dukanoh includes buyer protection. Payments are held in escrow and only released to the seller once you confirm your piece has arrived safely.
          </Text>
        </View>

        <Divider style={styles.sectionDivider} />

        {/* Buyer tips */}
        <Text style={styles.sectionTitle}>Buying safely</Text>
        <Text style={styles.sectionSubtitle}>Tips to protect yourself when purchasing</Text>
        {BUYER_TIPS.map((tip) => (
          <View key={tip.text} style={styles.tipRow}>
            <Ionicons name={tip.icon} size={20} color={colors.primary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}

        <Divider style={styles.sectionDivider} />

        {/* Seller tips */}
        <Text style={styles.sectionTitle}>Selling tips</Text>
        <Text style={styles.sectionSubtitle}>How to make the most of your listings</Text>
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
              <Text style={styles.sellerCtaTitle}>Want to sell?</Text>
              <Text style={styles.sellerCtaSubtitle}>
                Anyone can sell on Dukanoh. Create your first listing in minutes and get verified to start receiving payments.
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
