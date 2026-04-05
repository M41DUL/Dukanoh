import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';

const CATEGORY_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Men: 'man-outline',
  Women: 'woman-outline',
  Casualwear: 'shirt-outline',
  Partywear: 'sparkles-outline',
  Festive: 'ribbon-outline',
  Formal: 'briefcase-outline',
  Achkan: 'person-outline',
  Wedding: 'heart-outline',
  'Pathani Suit': 'body-outline',
  Shoes: 'walk-outline',
};

interface TrendingStripProps {
  categories: string[];
  colors: ColorTokens;
}

export function TrendingStrip({ categories, colors }: TrendingStripProps) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  if (categories.length === 0) return null;
  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={styles.tile}
            onPress={() =>
              router.push({
                pathname: '/listings',
                params: { title: cat, categories: cat },
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name={CATEGORY_ICON[cat] ?? 'pricetag-outline'} size={20} color={colors.textPrimary} />
            <Text style={styles.label} numberOfLines={1}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    section: { marginBottom: Spacing.xl },
    scroll: { marginHorizontal: -Spacing.base },
    row: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs, alignItems: 'center' },
    tile: {
      width: 110,
      height: 110,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    label: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      fontWeight: '600' as const,
    },
  });
}
