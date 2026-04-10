import React from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FontFamily, Spacing, BorderRadius, Typography } from '@/constants/theme';
import { HUB, HubListing } from './hubTheme';

interface Props {
  listing: HubListing;
  onShare: (id: string) => void;
  sharing: boolean;
  onAssign: () => void;
}

export function HubListingRow({ listing, onShare, sharing, onAssign }: Props) {
  const imageUri = listing.images?.[0];

  return (
    <TouchableOpacity
      style={styles.listingRow}
      activeOpacity={0.8}
      onPress={() => router.push(`/listing/edit/${listing.id}`)}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.listingThumb} />
      ) : (
        <View style={[styles.listingThumb, styles.listingThumbPlaceholder]}>
          <Ionicons name="image-outline" size={16} color={HUB.textSecondary} />
        </View>
      )}

      <View style={styles.listingInfo}>
        <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.listingPrice}>£{listing.price.toFixed(0)}</Text>
        <View style={styles.listingStats}>
          <Ionicons name="eye-outline" size={12} color={HUB.textSecondary} />
          <Text style={styles.listingStatText}>{listing.view_count}</Text>
          <Ionicons name="heart-outline" size={12} color={HUB.textSecondary} style={{ marginLeft: 8 }} />
          <Text style={styles.listingStatText}>{listing.save_count}</Text>
        </View>
      </View>

      <View style={styles.listingActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onShare(listing.id)} disabled={sharing} hitSlop={8}>
          {sharing
            ? <ActivityIndicator size="small" color={HUB.textSecondary} />
            : <Ionicons name="share-social-outline" size={18} color={HUB.textSecondary} />
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onAssign} hitSlop={8}>
          <Ionicons name="folder-outline" size={18} color={HUB.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HUB.surface,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: HUB.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.medium,
    backgroundColor: HUB.surfaceElevated,
  },
  listingThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: 2,
  },
  listingTitle: {
    ...Typography.body,
    color: HUB.textPrimary,
    fontFamily: FontFamily.medium,
  },
  listingPrice: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.accent,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  listingStatText: {
    ...Typography.caption,
    color: HUB.textSecondary,
    marginLeft: 3,
  },
  listingActions: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
