import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Divider } from '@/components/Divider';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { useBasket } from '@/hooks/useBasket';
import { recordView } from '@/hooks/useRecentlyViewed';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const { addItem, removeItem, isInBasket } = useBasket();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setListing(data as unknown as Listing);
          recordView(id);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!listing) return null;

  const handleMessage = () => {
    router.push(`/conversation/${id}`);
  };

  return (
    <ScreenWrapper>
      <Header showBack />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imageBreakout}>
        <View style={styles.imageContainer}>
          {listing.images?.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / width);
                  setImageIndex(index);
                }}
              >
                {listing.images.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.image} resizeMode="cover" />
                ))}
              </ScrollView>
              {listing.images.length > 1 && (
                <View style={styles.dots}>
                  {listing.images.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === imageIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
        </View>
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={3}>
              {listing.title}
            </Text>
            <Badge label={listing.category} active />
          </View>

          <Text style={styles.price}>£{listing.price?.toFixed(2)}</Text>
          <Badge label={listing.condition} style={styles.conditionBadge} />

          <Divider />

          <TouchableOpacity style={styles.sellerRow} activeOpacity={0.8}>
            <Avatar
              uri={listing.seller?.avatar_url}
              initials={listing.seller?.username?.[0]?.toUpperCase()}
              size="medium"
            />
            <View>
              <Text style={styles.sellerName}>@{listing.seller?.username}</Text>
              <Text style={styles.sellerSub}>View profile</Text>
            </View>
          </TouchableOpacity>

          <Divider />

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{listing.description ?? '—'}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.basketToggle}
          onPress={() =>
            id && (isInBasket(id) ? removeItem(id) : addItem(id))
          }
          activeOpacity={0.8}
        >
          <Ionicons
            name={isInBasket(id ?? '') ? 'cart' : 'cart-outline'}
            size={24}
            color={isInBasket(id ?? '') ? colors.primary : colors.textPrimary}
          />
        </TouchableOpacity>
        <Button
          label="Message Seller"
          onPress={handleMessage}
          style={styles.messageBtn}
        />
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    imageBreakout: { marginHorizontal: -Spacing.base },
    imageContainer: { width, height: 360, backgroundColor: colors.surface },
    image: { width, height: 360 },
    imagePlaceholder: { flex: 1 },
    dots: {
      position: 'absolute',
      bottom: Spacing.sm,
      flexDirection: 'row',
      gap: Spacing.xs,
      alignSelf: 'center',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    dotActive: { backgroundColor: colors.background },
    content: { paddingVertical: Spacing.base, gap: Spacing.sm },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    title: { ...Typography.heading, color: colors.textPrimary, flex: 1 },
    price: { ...Typography.heading, color: colors.primary },
    conditionBadge: { alignSelf: 'flex-start' },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
    },
    sellerName: { ...Typography.body, color: colors.textPrimary, fontWeight: '600' },
    sellerSub: { ...Typography.caption, color: colors.textSecondary },
    sectionLabel: { ...Typography.label, color: colors.textPrimary },
    description: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.base,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    basketToggle: {
      width: 52,
      height: 52,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    messageBtn: { flex: 1 },
  });
}
