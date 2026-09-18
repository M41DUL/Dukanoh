import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { ColorTokens } from '@/constants/theme';

// Terms 4.7: 3 active strikes → warning, 5 → selling paused. Shown on both
// profile variants and the Sell tab. "Request a review" is the human-review
// route promised in Privacy §20 (support form, appeals category).
const REVIEW_URL = 'https://www.dukanoh.com/support?type=appeals';
const WARN = '#F59E0B';

interface Props {
  status: string;
  strikeCount: number;
}

export function SellerStandingBanner({ status, strikeCount }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  if (status !== 'warned' && status !== 'suspended') return null;

  const paused = status === 'suspended';
  const accent = paused ? colors.error : WARN;

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <Ionicons name={paused ? 'pause-circle-outline' : 'warning-outline'} size={18} color={accent} />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: accent }]}>
          {paused ? 'Selling paused' : 'Cancellation warning'}
        </Text>
        <Text style={styles.body}>
          {paused
            ? `After ${strikeCount} cancelled orders in 12 months, your listings are hidden and new sales are paused. Paid orders still need to be sent. Strikes expire 12 months after they were given.`
            : `You have ${strikeCount} cancellation strikes from the last 12 months. At 5, selling is paused. Strikes expire after 12 months.`}
        </Text>
        {paused && (
          <TouchableOpacity onPress={() => Linking.openURL(REVIEW_URL)} activeOpacity={0.7} accessibilityRole="link">
            <Text style={[styles.link, { color: colors.primary }]}>Request a review</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'flex-start',
      padding: Spacing.md,
      borderRadius: BorderRadius.medium,
      borderWidth: 1,
      backgroundColor: colors.surface,
      marginBottom: Spacing.base,
    },
    textCol: { flex: 1, gap: 4 },
    title: { fontSize: 14, ...FontFamily.semibold },
    body: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, ...FontFamily.regular },
    link: { fontSize: 13, marginTop: 4, ...FontFamily.semibold },
  });
