import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';


interface FAQ {
  question: string;
  answer: string;
}

const FAQS: FAQ[] = [
  {
    question: 'How does buying work?',
    answer: 'Find a piece you love, message the member if you have questions, then checkout directly in the app. Dukanoh Safe Checkout is included on every order. Your payment is held securely in escrow until you confirm the piece has arrived.',
  },
  {
    question: 'What is the Dukanoh Safe Checkout charge?',
    answer: 'Every purchase includes Dukanoh Safe Checkout — a small charge of 6.5% of the item price plus £0.80. This covers you if your piece doesn\'t arrive or doesn\'t match the listing. The charge is non-refundable but the full item price is refunded if a dispute is resolved in your favour.',
  },
  {
    question: 'What is Dukanoh Safe Checkout?',
    answer: 'Every purchase on Dukanoh includes Dukanoh Safe Checkout. If your piece doesn\'t arrive or doesn\'t match the listing, raise a dispute and our team will step in. Payments are only released to the seller once you confirm receipt, or automatically after 2 days.',
  },
  {
    question: 'Can I return a piece?',
    answer: 'If there\'s an issue with your order — wrong item, not as described, damaged, or it never arrived — raise a dispute from your order screen. Our team reviews all disputes and will resolve it fairly.',
  },
  {
    question: 'How do I become a seller?',
    answer: 'Anyone can sell on Dukanoh. Just tap the Sell tab to create your first listing. To receive payments, you\'ll need to complete Dukanoh Verify — a quick identity check that takes a few minutes.',
  },
  {
    question: 'When do I get paid as a seller?',
    answer: 'Once the buyer confirms receipt of their piece, your earnings move to your wallet. If they don\'t confirm within 2 days, funds are released automatically. You can withdraw to your bank at any time once you\'re verified.',
  },
  {
    question: 'What if I have an issue with another member?',
    answer: 'You can report any member or listing by tapping the flag icon on their profile or listing. For order issues, raise a dispute directly from your order screen and our team will review it.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Go to Settings and scroll to the bottom. Tap "Delete Account" — this will permanently remove your account and all your data. This cannot be undone.',
  },
];

export default function HelpScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <ScreenWrapper>
      <Header title="Help & Support" showBack />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* FAQs */}
        <Text style={styles.sectionTitle}>Frequently asked questions</Text>
        <View style={styles.faqList}>
          {FAQS.map((faq, i) => (
            <View key={faq.question}>
              <View style={styles.faqItem}>
                <Text style={styles.question}>{faq.question}</Text>
                <Text style={styles.answer}>{faq.answer}</Text>
              </View>
              {i < FAQS.length - 1 && <Divider style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Get in touch */}
        <Text style={styles.sectionTitle}>Still need help?</Text>
        <Text style={styles.contactBody}>
          Can't find what you're looking for? Send us a message and we'll get back to you.
        </Text>
        <TouchableOpacity
          style={styles.emailBtn}
          onPress={() => router.push('/feedback')}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          <Text style={styles.emailBtnText}>Send us a message</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    faqList: {
      marginTop: -Spacing.xs,
    },
    faqItem: {
      paddingVertical: Spacing.lg,
      gap: Spacing.sm,
    },
    question: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    answer: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    divider: {
      marginVertical: 0,
    },
    contactBody: {
      ...Typography.body,
      color: colors.textSecondary,
      marginTop: -Spacing.xs,
    },
    emailBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    emailBtnText: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
  });
}
