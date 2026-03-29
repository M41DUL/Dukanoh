import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/Button';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface Step {
  icon: IoniconsName;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: 'search-outline',
    title: 'Browse',
    description: 'Discover South Asian fashion from trusted sellers in the community.',
  },
  {
    icon: 'chatbubble-outline',
    title: 'Message',
    description: 'Chat with sellers, ask questions and make offers directly.',
  },
  {
    icon: 'cash-outline',
    title: 'Agree & Pay',
    description: 'Arrange payment directly with the seller — no middleman.',
  },
  {
    icon: 'star-outline',
    title: 'Review',
    description: 'Leave a review after your purchase to build trust in the community.',
  },
];

export default function HowItWorksScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Check if user is a seller (we'll read from user metadata or fetch)
  const [isSeller, setIsSeller] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await import('@/lib/supabase').then(m =>
        m.supabase.from('users').select('is_seller').eq('id', user.id).maybeSingle()
      );
      setIsSeller(data?.is_seller ?? false);
    })();
  }, [user]);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>How Dukanoh Works</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
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

        {!isSeller && (
          <View style={styles.sellerCta}>
            <Text style={styles.sellerCtaTitle}>Want to sell?</Text>
            <Text style={styles.sellerCtaSubtitle}>
              Get a seller invite from a friend to start listing your items.
            </Text>
            <Button
              label="I have a seller code"
              variant="primary"
              onPress={() => {
                // Navigate to seller activation flow
                // This would open a modal/screen to enter seller invite code
              }}
              style={styles.sellerCtaBtn}
            />
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    backBtn: { padding: Spacing.xs, width: 40 },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    content: {
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },

    // Step cards
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
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    stepTitle: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
    },
    stepDescription: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },

    // Seller CTA
    sellerCta: {
      marginTop: Spacing.xl,
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
