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
    answer: 'Discover a piece, message the member if you have questions, then checkout in the app. Dukanoh Safe Checkout is included on every order. Your payment is held by Stripe until you confirm the piece has arrived.',
  },
  {
    question: 'What is Dukanoh Safe Checkout?',
    answer: 'Dukanoh Safe Checkout covers orders up to £1,000. If your piece doesn\'t arrive or doesn\'t match the listing, raise a dispute within 48 hours of delivery and our team will step in. We aim to resolve all claims within 7 days. The Safe Checkout charge is non-refundable, but the full item price is refunded if a dispute is resolved in your favour.',
  },
  {
    question: 'How much does Dukanoh Safe Checkout cost?',
    answer: 'Dukanoh Safe Checkout is charged to the buyer at 6.5% of the item price plus £0.80 per order. Sellers pay no commission — you keep 100% of your listing price.',
  },
  {
    question: 'Something\'s wrong with my order — what do I do?',
    answer: 'Tap "Report an issue" from your order screen within 48 hours of delivery. Our Trust & Safety team reviews all disputes and will respond within 7 days. If your dispute is upheld, you\'ll receive a full refund on the item price.',
  },
  {
    question: 'How do I become a seller?',
    answer: 'Tap the Sell tab and create your first listing. To receive payments, complete Dukanoh Verify — a quick identity check powered by Stripe. It takes a few minutes.',
  },
  {
    question: 'When do I get paid as a seller?',
    answer: 'Once the buyer confirms receipt, your earnings are held for 48 hours in case of disputes, then released to your wallet. If the buyer doesn\'t confirm, funds are released automatically 7 days after you ship. You can withdraw to your bank from the Wallet screen once you\'re verified.',
  },
  {
    question: 'How long do I have to dispatch?',
    answer: 'You must dispatch within 5 days of a sale. If you don\'t ship in time, the order is automatically cancelled and the buyer is refunded in full.',
  },
  {
    question: 'What if I have an issue with another member?',
    answer: 'Tap the flag icon on any profile or listing to report it. For order issues, raise a dispute directly from your order screen.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Go to Settings and scroll to the bottom. Tap "Delete Account" — this permanently removes your account and all your data. It cannot be undone.',
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
          Can't find what you're looking for? Send us a message and we'll get back to you as soon as we can.
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
