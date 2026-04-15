import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '@/lib/imageUtils';
import { FontFamily, BorderRadius, Spacing, type ColorTokens } from '@/constants/theme';

interface Props {
  name: string;
  listingCount: number;
  previewImage: string | null;
  onPress: () => void;
  colors: ColorTokens;
}

export function SellerCollectionTile({ name, listingCount, previewImage, onPress, colors }: Props) {
  return (
    <TouchableOpacity
      style={[styles.tile, { borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {previewImage ? (
        <>
          <Image
            source={{ uri: getImageUrl(previewImage, 'card') }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.68)']}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.overlay}>
            <Text style={styles.nameOnImage} numberOfLines={1}>{name}</Text>
            <Text style={styles.countOnImage}>
              {listingCount} listing{listingCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </>
      ) : (
        <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
          <Ionicons name="albums-outline" size={28} color={colors.textSecondary} />
          <Text style={[styles.namePlaceholder, { color: colors.textPrimary }]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[styles.countPlaceholder, { color: colors.textSecondary }]}>
            {listingCount} listing{listingCount !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  overlay: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    right: Spacing.sm,
  },
  nameOnImage: {
    fontSize: 14,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
  },
  countOnImage: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  namePlaceholder: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  countPlaceholder: {
    fontSize: 11,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
});
