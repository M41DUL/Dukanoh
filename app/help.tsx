import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

const SUPPORT_EMAIL = 'support@dukanoh.com';

interface FAQ {
  question: string;
  answer: string;
}

const FAQS: FAQ[] = [
  {
    question: 'How do I pay for an item?',
    answer: 'Dukanoh does not process payments. Once you agree on a price with the seller, payment is arranged directly between you. We recommend using PayPal Goods & Services for buyer protection on posted items.',
  },
  {
    question: 'How do I get an invite?',
    answer: 'Dukanoh is invite-only. Ask a friend who is already on the platform to share their invite link with you.',
  },
  {
    question: 'Can I return an item?',
    answer: 'Returns are not managed by Dukanoh. We recommend agreeing on a return policy with the seller before purchasing. Always ask questions and check photos carefully beforehand.',
  },
  {
    question: 'How do I become a seller?',
    answer: 'You need a seller invite from an existing seller on Dukanoh. Once you have a code, you can start listing items straight away.',
  },
  {
    question: 'What if I have an issue with a buyer or seller?',
    answer: 'You can report any user or listing by tapping the flag icon on their profile or listing. Our team reviews all reports. For payment disputes, contact your payment provider directly.',
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
        <Text style={styles.sectionTitle}>Get in touch</Text>
        <Text style={styles.contactBody}>
          Can't find what you're looking for? We're happy to help.
        </Text>
        <TouchableOpacity
          style={styles.emailBtn}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          activeOpacity={0.7}
        >
          <Ionicons name="mail-outline" size={20} color={colors.primary} />
          <Text style={styles.emailBtnText}>{SUPPORT_EMAIL}</Text>
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
      color: colors.primary,
    },
  });
}
