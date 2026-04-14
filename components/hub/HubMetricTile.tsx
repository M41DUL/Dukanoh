import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Spacing, BorderRadius, Typography, type ProColorTokens } from '@/constants/theme';

interface Props {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  footnote?: string;
  P: ProColorTokens;
}

export function HubMetricTile({ label, value, icon, footnote, P }: Props) {
  return (
    <View style={[styles.tile, { backgroundColor: P.surface, borderColor: P.border }]}>
      <Ionicons name={icon} size={18} color={P.primary} />
      <Text style={[styles.value, { color: P.textPrimary }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.label, { color: P.textSecondary }]}>
        {label}{footnote ? ` (${footnote})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.5,
  },
  label: {
    ...Typography.caption,
    textAlign: 'center',
  },
});
