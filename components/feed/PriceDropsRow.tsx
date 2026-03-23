import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import type { PriceDrop } from '@/hooks/useFeed';

interface PriceDropsRowProps {
  drops: PriceDrop[];
  colors: ColorTokens;
}

export function PriceDropsRow({ drops, colors }: PriceDropsRowProps) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  if (drops.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        Price drops
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {drops.map(drop => (
          <TouchableOpacity
            key={drop.listingId}
            style={styles.card}
            onPress={() => router.push(`/listing/${drop.listingId}`)}
            activeOpacity={0.8}
          >
            <Image source={{ uri: drop.images?.[0] }} style={styles.image} contentFit="cover" transition={200} />
            <Text style={styles.title} numberOfLines={1}>{drop.title}</Text>
            <Text style={styles.oldPrice}>{'\u00A3'}{drop.savedPrice.toFixed(2)}</Text>
            <Text style={styles.newPrice}>{'\u00A3'}{drop.currentPrice.toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    section: { marginBottom: Spacing.xl },
    sectionTitle: {
      ...Typography.label,
      marginBottom: Spacing.md,
    },
    scroll: { marginHorizontal: -Spacing.base },
    row: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs },
    card: { width: 110 },
    image: {
      width: 110,
      height: 140,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      marginBottom: Spacing.xs,
    },
    title: { ...Typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    oldPrice: {
      ...Typography.caption,
      color: colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    newPrice: { ...Typography.caption, color: '#22C55E', fontFamily: 'Inter_700Bold' },
  });
}
