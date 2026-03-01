import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';
import { Avatar } from './Avatar';
import { Badge } from './Badge';

export interface Listing {
  id: string;
  title: string;
  price: number;
  category: string;
  images: string[];
  condition: string;
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
  const isGrid = variant === 'grid';

  return (
    <TouchableOpacity
      style={[isGrid ? styles.grid : styles.featured, style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.imageContainer, isGrid ? styles.gridImage : styles.featuredImage]}>
        {listing.images?.[0] ? (
          <Image
            source={{ uri: listing.images[0] }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder} />
        )}
        <View style={styles.badgePosition}>
          <Badge label={listing.category} active />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={styles.price}>£{listing.price.toFixed(2)}</Text>
        <View style={styles.sellerRow}>
          <Avatar
            uri={listing.seller.avatar_url}
            initials={listing.seller.username?.[0]?.toUpperCase() ?? '?'}
            size="small"
          />
          <Text style={styles.sellerName}>@{listing.seller.username}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featured: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: Colors.surface,
  },
  gridImage: { height: 200 },
  featuredImage: { height: 280 },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, backgroundColor: Colors.surface },
  badgePosition: { position: 'absolute', top: Spacing.sm, left: Spacing.sm },
  content: { padding: Spacing.sm, gap: Spacing.xs },
  title: { ...Typography.body, color: Colors.textPrimary, fontWeight: '500' },
  price: { ...Typography.subheading, color: Colors.primary },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  sellerName: { ...Typography.caption, color: Colors.textSecondary },
});
