import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { DukanohLogo } from '@/components/DukanohLogo';
import { FontFamily, Spacing, BorderRadius } from '@/constants/theme';
import { HUB, HubListing } from './hubTheme';

interface Props {
  listing: HubListing;
}

export function HubShareCard({ listing }: Props) {
  const imageUri = listing.images?.[0];
  return (
    <View style={styles.shareCard}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.shareCardImage} />
      ) : (
        <View style={[styles.shareCardImage, { backgroundColor: HUB.surfaceElevated }]} />
      )}
      <View style={styles.shareCardBody}>
        <DukanohLogo width={72} height={13} color={HUB.accent} />
        <Text style={styles.shareCardTitle} numberOfLines={2}>{listing.title}</Text>
        <Text style={styles.shareCardPrice}>£{listing.price.toFixed(0)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shareCard: {
    width: 300,
    backgroundColor: HUB.background,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
  },
  shareCardImage: {
    width: 300,
    height: 360,
  },
  shareCardBody: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    backgroundColor: HUB.surface,
  },
  shareCardTitle: {
    fontSize: 15,
    fontFamily: FontFamily.semibold,
    color: HUB.textPrimary,
    marginTop: Spacing.xs,
  },
  shareCardPrice: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: HUB.accent,
  },
});
