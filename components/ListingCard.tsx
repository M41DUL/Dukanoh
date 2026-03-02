import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, BorderRadius, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSaved } from '@/context/SavedContext';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  category: string;
  images: string[];
  condition: string;
  size?: string;
  status: 'available' | 'sold' | 'draft';
  view_count?: number;
  seller: {
    username: string;
    avatar_url?: string;
    rating_avg?: number;
    rating_count?: number;
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
  const { isSaved, toggleSave } = useSaved();
  const isGrid = variant === 'grid';
  const meta = [listing.condition, listing.size].filter(Boolean).join(' · ');
  const saved = isSaved(listing.id);

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
        {listing.status === 'sold' && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldLabel}>SOLD</Text>
          </View>
        )}
        {listing.status !== 'sold' && (
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={() => toggleSave(listing.id, listing.price)}
            hitSlop={8}
            activeOpacity={0.8}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={18}
              color={saved ? '#FF4444' : 'rgba(255,255,255,0.9)'}
            />
          </TouchableOpacity>
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
    soldOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    soldLabel: {
      color: '#fff',
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
    },
    heartBtn: {
      position: 'absolute',
      top: Spacing.xs,
      right: Spacing.xs,
      backgroundColor: 'rgba(0,0,0,0.22)',
      borderRadius: BorderRadius.full,
      padding: 6,
    },
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
