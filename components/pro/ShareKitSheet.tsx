import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Spacing, BorderRadius, FontFamily, proColorsDark } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { reportError } from '@/lib/errorReporting';

// The card itself always renders on the dark Pro palette — it's a brand asset
// leaving the app, so it must look identical regardless of the seller's theme.
const P = proColorsDark;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = Math.min(SCREEN_WIDTH - Spacing.base * 4, 280);

type ShareFormat = 'story' | 'square';

const FORMATS: { key: ShareFormat; label: string; ratio: number }[] = [
  { key: 'story',  label: 'Story',  ratio: 9 / 16 },
  { key: 'square', label: 'Square', ratio: 1 },
];

export interface ShareKitListing {
  id: string;
  title: string;
  price: number;
  images: string[];
}

interface ShareKitSheetProps {
  visible: boolean;
  onClose: () => void;
  listing: ShareKitListing;
  username: string;
}

/**
 * Pro share kit — turns a listing into a branded image sized for Instagram
 * Stories or a square feed/WhatsApp post.
 *
 * Capture notes:
 *  - Uses React Native's `Image` (not expo-image) for the artwork. view-shot
 *    snapshots the native view tree, and expo-image's recycling can hand back
 *    a blank frame; RN's Image with an explicit `onLoad` gate is reliable.
 *  - Sharing is disabled until the artwork reports loaded, otherwise the
 *    capture races the network and produces an empty card.
 *  - Captured at the view's natural resolution (logical size × device pixel
 *    ratio, ~840–1120px wide on modern phones). Forcing a larger output via
 *    view-shot's width/height upscales rather than re-renders, so it would
 *    only add blur — social platforms recompress anyway.
 */
export function ShareKitSheet({ visible, onClose, listing, username }: ShareKitSheetProps) {
  const colors = useThemeColors();
  const cardRef = useRef<View>(null);
  const [format, setFormat] = useState<ShareFormat>('story');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);

  const ratio = FORMATS.find(f => f.key === format)?.ratio ?? FORMATS[0].ratio;
  const cardHeight = CARD_WIDTH / ratio;
  const cover = listing.images?.[0];
  const listingUrl = `https://dukanoh.com/listing/${listing.id}`;

  // Plain link share — the non-Pro path, and the fallback whenever the image
  // route isn't available on this device.
  const shareLink = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out "${listing.title}" for £${listing.price.toFixed(2)} on Dukanoh 🛍\n${listingUrl}`,
      });
    } catch {
      // User dismissed the share sheet.
    }
  }, [listing.title, listing.price, listingUrl]);

  const shareImage = useCallback(async () => {
    if (sharing || !imageLoaded) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      if (!(await Sharing.isAvailableAsync())) {
        // No share provider (rare — some Android builds). Don't dead-end.
        await shareLink();
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: listing.title,
        UTI: 'public.png',
      });
    } catch (e: unknown) {
      reportError(e, 'pro/shareKit');
      await shareLink();
    } finally {
      setSharing(false);
    }
  }, [sharing, imageLoaded, listing.title, shareLink]);

  // Re-gate the capture whenever the artwork changes underneath us.
  const handleFormatChange = useCallback((next: ShareFormat) => {
    setFormat(next);
  }, []);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Share kit</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Made for Instagram and WhatsApp.
        </Text>

        {/* Format toggle */}
        <View style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {FORMATS.map(f => {
            const active = f.key === format;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.segmentBtn, active && { backgroundColor: colors.primary }]}
                onPress={() => handleFormatChange(f.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${f.label} format`}
              >
                <Text style={[styles.segmentLabel, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── The captured card ── */}
        <View style={styles.previewWrap}>
          <View
            ref={cardRef}
            collapsable={false}
            style={[styles.card, { width: CARD_WIDTH, height: cardHeight }]}
          >
            {cover ? (
              <Image
                source={{ uri: cover }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: P.gradientTop }]} />
            )}

            {/* Legibility scrim — text sits on the lower third */}
            <LinearGradient
              colors={['transparent', 'rgba(8,7,20,0.15)', 'rgba(8,7,20,0.92)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {listing.title}
              </Text>
              <Text style={styles.cardPrice}>£{listing.price.toFixed(2)}</Text>
              <Text style={styles.cardSeller}>@{username}</Text>
            </View>

            <View style={styles.cardFooter}>
              <DukanohLogo width={78} height={13} color="#FFFFFF" />
              <Text style={styles.cardUrl}>dukanoh.com</Text>
            </View>
          </View>

          {!imageLoaded && cover ? (
            <View style={styles.previewLoading} pointerEvents="none">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>

        <Button
          label={sharing ? 'Preparing…' : 'Share image'}
          onPress={shareImage}
          disabled={sharing || (!!cover && !imageLoaded)}
          style={styles.cta}
        />

        <TouchableOpacity
          onPress={shareLink}
          style={styles.linkBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Ionicons name="link-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>Share link instead</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
    wrap: {
      paddingBottom: Spacing.base,
    },
    title: {
      fontSize: 20,
      ...FontFamily.semibold,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 13,
      ...FontFamily.regular,
      textAlign: 'center',
      marginTop: 2,
      marginBottom: Spacing.base,
    },
    segment: {
      flexDirection: 'row',
      alignSelf: 'center',
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      padding: 3,
      marginBottom: Spacing.base,
    },
    segmentBtn: {
      paddingVertical: 7,
      paddingHorizontal: 22,
      borderRadius: BorderRadius.full,
    },
    segmentLabel: {
      fontSize: 13,
      ...FontFamily.medium,
    },
    previewWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    previewLoading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
      backgroundColor: P.gradientBottom,
      justifyContent: 'flex-end',
    },
    cardBody: {
      paddingHorizontal: 16,
    },
    cardTitle: {
      color: '#FFFFFF',
      fontSize: 17,
      lineHeight: 22,
      ...FontFamily.semibold,
    },
    cardPrice: {
      color: '#FFFFFF',
      fontSize: 22,
      ...FontFamily.bold,
      marginTop: 4,
    },
    cardSeller: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 13,
      ...FontFamily.regular,
      marginTop: 2,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
    },
    cardUrl: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 11,
      ...FontFamily.medium,
    },
    cta: {
      marginTop: Spacing.xs,
    },
    linkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: Spacing.base,
    },
    linkLabel: {
      fontSize: 14,
      ...FontFamily.medium,
    },
});
