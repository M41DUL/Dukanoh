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
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { StarRating } from '@/components/StarRating';
import { recordView } from '@/hooks/useRecentlyViewed';

const { width } = Dimensions.get('window');

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const { addItem, removeItem, isInBasket } = useBasket();
  const { isSaved, toggleSave } = useSaved();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('listings')
      .select('*, seller:users(username, avatar_url, rating_avg, rating_count)')
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

  useEffect(() => {
    if (!id || !user || !listing) return;
    if (listing.seller_id === user.id) return;

    Promise.all([
      supabase.from('conversations').select('id').eq('listing_id', id).eq('buyer_id', user.id).maybeSingle(),
      supabase.from('reviews').select('id').eq('reviewer_id', user.id).eq('listing_id', id).maybeSingle(),
    ]).then(([{ data: conv }, { data: review }]) => {
      setCanReview(!!conv && !review);
    });
  }, [id, user, listing]);

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
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>@{listing.seller?.username}</Text>
              {(listing.seller?.rating_count ?? 0) > 0 ? (
                <View style={styles.sellerRating}>
                  <StarRating rating={listing.seller?.rating_avg ?? 0} size={12} />
                  <Text style={styles.sellerSub}>
                    {(listing.seller?.rating_avg ?? 0).toFixed(1)} ({listing.seller?.rating_count})
                  </Text>
                </View>
              ) : (
                <Text style={styles.sellerSub}>No reviews yet</Text>
              )}
            </View>
          </TouchableOpacity>

          <Divider />

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{listing.description ?? '—'}</Text>

          {canReview && (
            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => router.push(`/review/${id}?sellerName=${listing.seller?.username ?? ''}&listingTitle=${encodeURIComponent(listing.title)}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="star-outline" size={16} color={colors.primary} />
              <Text style={styles.reviewBtnText}>Rate this seller</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerIconBtn}
          onPress={() => id && toggleSave(id)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isSaved(id ?? '') ? 'heart' : 'heart-outline'}
            size={24}
            color={isSaved(id ?? '') ? '#FF4444' : colors.textPrimary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerIconBtn}
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
    sellerInfo: { flex: 1, gap: 2 },
    sellerName: { ...Typography.body, color: colors.textPrimary, fontWeight: '600' },
    sellerRating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    sellerSub: { ...Typography.caption, color: colors.textSecondary },
    reviewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      alignSelf: 'flex-start',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: colors.primary,
      marginTop: Spacing.xs,
    },
    reviewBtnText: {
      ...Typography.label,
      color: colors.primary,
    },
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
    footerIconBtn: {
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
