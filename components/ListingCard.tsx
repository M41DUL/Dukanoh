import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Typography, BorderRadius, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

export interface Listing {
  id: string;
  title: string;
  price: number;
  category: string;
  images: string[];
  condition: string;
  size?: string;
  status: 'available' | 'sold';
  seller: {
    username: string;
    avatar_url?: string;
  };
}

interface ListingCardProps {
  listing: Listing;
  variant?: 'grid' | 'featured';
  onPress?: () => void;
  style?: ViewStyle;
}

export function ListingCard({
  listing,
  variant = 'grid',
  onPress,
  style,
}: ListingCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const isGrid = variant === 'grid';
  const meta = [listing.condition, listing.size].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[isGrid ? styles.grid : styles.featured, style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.imageContainer, isGrid ? styles.imageContainerGrid : styles.imageContainerFeatured]}>
        {listing.images?.[0] ? (
          <Image
            source={{ uri: listing.images[0] }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder} />
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        <Text style={styles.price}>£{listing.price.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    grid: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: BorderRadius.medium,
    },
    featured: {
      backgroundColor: colors.background,
      borderRadius: BorderRadius.large,
      marginBottom: Spacing.base,
    },
    imageContainer: {
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    imageContainerGrid: {
      aspectRatio: 4 / 5,
      borderRadius: BorderRadius.medium,
    },
    imageContainerFeatured: {
      height: 280,
      borderRadius: BorderRadius.large,
    },
    image: { width: '100%', height: '100%' },
    imagePlaceholder: { flex: 1, backgroundColor: colors.surface },
    content: { paddingVertical: Spacing.sm, gap: 3 },
    title: { ...Typography.body, color: colors.textPrimary, fontWeight: '500' },
    meta: { ...Typography.caption, color: colors.textSecondary },
    price: {
      fontSize: 15,
      fontWeight: '700',
      fontFamily: 'Inter_700Bold',
      color: colors.textPrimary,
      marginTop: 1,
    },
  });
}
