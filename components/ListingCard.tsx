import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useSaved } from '@/context/SavedContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  category: string;
  images: string[];
  condition: string;
  size?: string;
  occasion?: string;
  measurements?: { chest?: number; waist?: number; length?: number };
  description?: string;
  worn_at?: string;
  status: 'available' | 'sold' | 'draft';
  view_count?: number;
  save_count?: number;
  created_at?: string;
  isBoosted?: boolean;
  seller: {
    username: string;
    avatar_url?: string;
    rating_avg?: number;
    rating_count?: number;
    created_at?: string;
  };
}

interface ListingCardProps {
  listing: Listing;
  variant?: 'grid' | 'featured';
  highlightTerm?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

function HighlightedText({ text, term, style: textStyle, boldStyle }: {
  text: string;
  term: string;
  style: any;
  boldStyle: any;
}) {
  if (!term) return <Text style={textStyle} numberOfLines={1}>{text}</Text>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <Text style={textStyle} numberOfLines={1}>{text}</Text>;
  return (
    <Text style={textStyle} numberOfLines={1}>
      {text.slice(0, idx)}
      <Text style={boldStyle}>{text.slice(idx, idx + term.length)}</Text>
      {text.slice(idx + term.length)}
    </Text>
  );
}

export function ListingCard({
  listing,
  variant = 'grid',
  highlightTerm,
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
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.imagePlaceholder} />
        )}
        {listing.status === 'sold' && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldLabel}>SOLD</Text>
          </View>
        )}
        {listing.isBoosted && listing.status !== 'sold' && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredText}>Featured</Text>
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
              color={saved ? colors.error : 'rgba(255,255,255,0.9)'}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <HighlightedText
          text={listing.title}
          term={highlightTerm ?? ''}
          style={styles.title}
          boldStyle={styles.titleHighlight}
        />
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
      borderRadius: 6,
    },
    imageContainerFeatured: {
      height: 280,
      borderRadius: 6,
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
    featuredBadge: {
      position: 'absolute',
      top: Spacing.xs,
      left: Spacing.xs,
      backgroundColor: '#C7F75E',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    featuredText: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
      color: '#0D0D0D',
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
    title: { ...Typography.body, color: colors.textPrimary, fontWeight: '600', fontFamily: FontFamily.semibold },
    titleHighlight: { fontFamily: 'Inter_700Bold', fontWeight: '700' },
    meta: { ...Typography.body, color: colors.textSecondary },
    price: {
      ...Typography.body,
      color: colors.textPrimary,
      marginTop: 1,
    },
  });
}
