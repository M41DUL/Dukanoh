import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily, Spacing, Typography, type ProColorTokens } from '@/constants/theme';

interface Props {
  occasion: string;
  saves: number;
  views: number;
  topSaves: number;
  P: ProColorTokens;
}

export function HubOccasionRow({ occasion, saves, views, topSaves, P }: Props) {
  const barWidth = topSaves > 0 ? (saves / topSaves) * 100 : 0;
  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Text style={[styles.name, { color: P.textPrimary }]}>{occasion}</Text>
        <Text style={[styles.stats, { color: P.textSecondary }]}>{saves} saves · {views} views</Text>
      </View>
      <View style={[styles.barBg, { backgroundColor: P.surfaceElevated }]}>
        <View style={[styles.barFill, { width: `${barWidth}%` as `${number}%`, backgroundColor: P.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...Typography.body,
    fontFamily: FontFamily.medium,
    textTransform: 'capitalize',
  },
  stats: {
    ...Typography.caption,
  },
  barBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
