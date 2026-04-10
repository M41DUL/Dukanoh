import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily, Spacing, Typography } from '@/constants/theme';
import { HUB } from './hubTheme';

interface Props {
  occasion: string;
  saves: number;
  views: number;
  topSaves: number;
}

export function HubOccasionRow({ occasion, saves, views, topSaves }: Props) {
  const barWidth = topSaves > 0 ? (saves / topSaves) * 100 : 0;
  return (
    <View style={styles.occasionRow}>
      <View style={styles.occasionMeta}>
        <Text style={styles.occasionName}>{occasion}</Text>
        <Text style={styles.occasionStats}>{saves} saves · {views} views</Text>
      </View>
      <View style={styles.occasionBarBg}>
        <View style={[styles.occasionBarFill, { width: `${barWidth}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  occasionRow: {
    gap: Spacing.xs,
  },
  occasionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  occasionName: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
    textTransform: 'capitalize',
  },
  occasionStats: {
    ...Typography.caption,
    color: HUB.textSecondary,
  },
  occasionBarBg: {
    height: 4,
    backgroundColor: HUB.surfaceElevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  occasionBarFill: {
    height: '100%',
    backgroundColor: HUB.accent,
    borderRadius: 2,
  },
});
