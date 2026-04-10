import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { HUB } from './hubTheme';

interface Props {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  footnote?: string;
}

export function HubMetricTile({ label, value, icon, footnote }: Props) {
  return (
    <View style={styles.metricTile}>
      <Ionicons name={icon} size={18} color={HUB.accent} />
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}{footnote ? ` (${footnote})` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricTile: {
    flex: 1,
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    color: HUB.textPrimary,
    letterSpacing: -0.5,
  },
  metricLabel: {
    ...Typography.caption,
    color: HUB.textSecondary,
    textAlign: 'center',
  },
});
