import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: colors.primaryText }]}>See all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.subheading,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  seeAll: {
    ...Typography.body,
    fontFamily: 'Inter_600SemiBold',
  },
});
