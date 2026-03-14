import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Typography, Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

const STEPS = [
  'Message the seller to express interest',
  'Agree on price and payment directly',
  'Arrange collection or delivery between yourselves',
];

export function HowItWorks() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How it works</Text>
      {STEPS.map((label, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.numberBadge}>
            <Text style={styles.number}>{i + 1}</Text>
          </View>
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      gap: Spacing.sm,
    },
    title: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    numberBadge: {
      width: 20,
      height: 20,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    number: {
      ...Typography.caption,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      lineHeight: 14,
    },
    label: {
      ...Typography.caption,
      color: colors.textSecondary,
      flex: 1,
    },
  });
}
