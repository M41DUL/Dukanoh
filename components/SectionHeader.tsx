import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, subtitle, onSeeAll }: SectionHeaderProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
            <Text style={[styles.viewAll, { color: colors.textSecondary }]}>View all</Text>
          </TouchableOpacity>
        )}
      </View>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...Typography.subheading,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  viewAll: {
    ...Typography.body,
    fontFamily: 'Inter_500Medium',
  },
  subtitle: {
    ...Typography.body,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
