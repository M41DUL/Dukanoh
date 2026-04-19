import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { ListingGrid } from '@/components/ListingGrid';
import { SectionHeader } from '@/components/SectionHeader';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Listing } from '@/components/ListingCard';
import { SellerCollectionTile } from '@/components/profile/SellerCollectionTile';
import { SellerCollectionSheet } from '@/components/profile/SellerCollectionSheet';
import { Typography, Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';

interface Seller {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  rating_avg?: number;
  rating_count?: number;
  created_at?: string;
  is_verified?: boolean;
  is_seller?: boolean;
  seller_tier?: string;
  avg_response_time_mins?: number | null;
}

interface SellerCollection {
  id: string;
  name: string;
  listingCount: number;
  previewImage: string | null;
}

interface Review {
  id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  reviewer: { username: string; avatar_url?: string };
}

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isBlocked, blockUser } = useBlocked();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [seller, setSeller] = useState<Seller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [soldCount, setSoldCount] = useState<number | null>(null);
  const [responseRate, setResponseRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [firstConversationListingId, setFirstConversationListingId] = useState<string | null>(null);
  const [firstConversationId, setFirstConversationId] = useState<string | null>(null);
  const [collections, setCollections] = useState<SellerCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  useEffect(() => {
    if (id && isBlocked(id)) {
      router.back();
      return;
    }
  }, [id, isBlocked]);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      supabase.from('users').select('id, username, avatar_url, bio, rating_avg, rating_count, created_at, is_verified, is_seller, seller_tier, avg_response_time_mins').eq('id', id).single(),
      supabase
        .from('listings')
        .select('id, title, price, original_price, price_dropped_at, images, status, category, size, condition, save_count, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)')
        .eq('seller_id', id)
        .eq('status', 'available')
        .order('published_at', { ascending: false })
        .limit(20),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', id)
        .eq('status', 'sold'),
      supabase.rpc('get_seller_response_rate', { p_seller_id: id }),
      supabase
        .from('reviews')
        .select('*, reviewer:users(username, avatar_url)')
        .eq('seller_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('collections')
        .select('id, name')
        .eq('seller_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('listings')
        .select('id, images, collection_id')
        .eq('seller_id', id)
        .eq('status', 'available')
        .not('collection_id', 'is', null),
    ]).then(([
      { data: sellerData },
      { data: listingsData },
      { count: sold },
      { data: rate },
      { data: reviewsData },
      { data: collectionsRaw },
      { data: collectionListings },
    ]) => {
      if (sellerData) setSeller(sellerData as Seller);
      setListings((listingsData ?? []) as unknown as Listing[]);
      setSoldCount(sold ?? 0);
      if (rate !== null) setResponseRate(rate as number);
      setReviews((reviewsData ?? []) as Review[]);

      const builtCollections: SellerCollection[] = (collectionsRaw ?? [])
        .map(col => {
          const colListings = (collectionListings ?? []).filter(l => l.collection_id === col.id);
          return {
            id: col.id,
            name: col.name,
            listingCount: colListings.length,
            previewImage: (colListings[0]?.images as string[] | undefined)?.[0] ?? null,
          };
        })
        .filter(c => c.listingCount > 0);
      setCollections(builtCollections);

      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !user || user.id === id) return;

    Promise.all([
      supabase
        .from('conversations')
        .select('id, listing_id')
        .eq('seller_id', id)
        .eq('buyer_id', user.id)
        .limit(1),
      supabase
        .from('reviews')
        .select('id')
        .eq('reviewer_id', user.id)
        .eq('seller_id', id)
        .maybeSingle(),
      supabase
        .from('listings')
        .select('id')
        .eq('seller_id', id)
        .eq('buyer_id', user.id)
        .eq('status', 'sold')
        .limit(1),
    ]).then(([{ data: convs }, { data: existingReview }, { data: purchases }]) => {
      const hasConversation = (convs ?? []).length > 0;
      const hasReviewed = !!existingReview;
      const hasPurchased = (purchases ?? []).length > 0;
      setCanReview(hasPurchased && !hasReviewed);
      if (hasConversation && convs && convs[0]) {
        setFirstConversationListingId(convs[0].listing_id as string);
        setFirstConversationId(convs[0].id as string);
      }
    });
  }, [id, user]);

  const submitReport = () => {
    Alert.alert('Report submitted', 'Thank you for your report.');
  };

  const handleReport = () => {
    Alert.alert('Report user', 'Why are you reporting this user?', [
      { text: 'Spam', onPress: () => submitReport() },
      { text: 'Inappropriate behaviour', onPress: () => submitReport() },
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  };

  const handleBlock = () => {
    Alert.alert('Block user', `Block @${seller?.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          if (!user || !id) return;
          await blockUser(id);
          router.back();
        },
      },
    ], { cancelable: true });
  };

  const handleShare = () => {
    Share.share({ message: `Check out @${seller?.username} on Dukanoh` });
  };

  const handleMoreOptions = () => {
    const isOwnProfile = user?.id === id;
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }[] = [
      { text: 'Share', onPress: handleShare },
    ];
    if (!isOwnProfile) {
      options.push({ text: 'Report user', onPress: handleReport });
      options.push({ text: 'Block user', style: 'destructive', onPress: handleBlock });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Options', undefined, options, { cancelable: true });
  };

  if (loading) return <LoadingSpinner />;
  if (!seller) return null;

  const joinedDate = seller.created_at
    ? new Date(seller.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : null;

  const hasRating = (seller.rating_count ?? 0) > 0;
  const hasSold = (soldCount ?? 0) > 0;
  const hasResponseRate = responseRate !== null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>@{seller?.username}</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleMoreOptions} activeOpacity={0.8}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* SCROLL CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing['3xl'] }}
      >
        {/* PROFILE SECTION */}
        <View style={styles.profileSection}>
          <View style={styles.profileTop}>
            <Avatar
              uri={seller.avatar_url}
              initials={seller.username[0]?.toUpperCase()}
              size="medium"
            />
            <View style={styles.profileInfo}>
              <View style={styles.usernameRow}>
                <Text style={styles.username}>@{seller.username}</Text>
                {seller.is_verified && (
                  <View style={[styles.badgePill, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.badgePillText, { color: colors.primaryText }]}>✓ Verified</Text>
                  </View>
                )}
                {seller.seller_tier === 'pro' && (
                  <View style={[styles.badgePill, { backgroundColor: '#201A04' }]}>
                    <Text style={[styles.badgePillText, { color: '#C7A84F' }]}>◆ Pro</Text>
                  </View>
                )}
                {seller.seller_tier === 'pro' &&
                  seller.avg_response_time_mins != null &&
                  seller.avg_response_time_mins <= 120 && (
                  <View style={[styles.badgePill, { backgroundColor: '#1F2D08' }]}>
                    <Text style={[styles.badgePillText, { color: '#C7F75E' }]}>⚡ Fast Responder</Text>
                  </View>
                )}
              </View>
              {joinedDate ? (
                <Text style={styles.joinedText}>Joined {joinedDate}</Text>
              ) : null}
            </View>
          </View>

          {/* STATS ROW */}
          {(hasRating || hasSold || hasResponseRate) && (
            <View style={styles.statsRow}>
              {hasRating && (
                <View style={styles.statCell}>
                  <View style={styles.statValueRow}>
                    <StarRating rating={seller.rating_avg ?? 0} size={12} />
                    <Text style={styles.statValue}>{(seller.rating_avg ?? 0).toFixed(1)}</Text>
                  </View>
                  <Text style={styles.statLabel}>({seller.rating_count} reviews)</Text>
                </View>
              )}
              {hasSold && (
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{soldCount}</Text>
                  <Text style={styles.statLabel}>sold</Text>
                </View>
              )}
              {hasResponseRate && (
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{responseRate}%</Text>
                  <Text style={styles.statLabel}>response</Text>
                </View>
              )}
            </View>
          )}

          {/* Message button — only if not own profile and conversation exists */}
          {user?.id !== id && firstConversationId && (
            <TouchableOpacity
              style={styles.messageBtn}
              activeOpacity={0.8}
              onPress={() => router.push(`/conversation/${firstConversationId}`)}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.primaryText} />
              <Text style={[styles.messageBtnText, { color: colors.primaryText }]}>Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* COLLECTIONS — Pro sellers only, only if they have collections */}
        {seller.seller_tier === 'pro' && collections.length > 0 && (
          <>
            <View style={[styles.hairline, { backgroundColor: colors.border }]} />
            <View style={styles.section}>
              <SectionHeader title="Collections" />
              <View style={styles.collectionsGrid}>
                {collections.reduce<SellerCollection[][]>((rows, col, i) => {
                  if (i % 2 === 0) rows.push([col]);
                  else rows[rows.length - 1].push(col);
                  return rows;
                }, []).map((row, i) => (
                  <View key={i} style={styles.collectionsRow}>
                    {row.map(col => (
                      <SellerCollectionTile
                        key={col.id}
                        name={col.name}
                        listingCount={col.listingCount}
                        previewImage={col.previewImage}
                        onPress={() => setSelectedCollectionId(col.id)}
                        colors={colors}
                      />
                    ))}
                    {row.length === 1 && <View style={{ flex: 1 }} />}
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* HAIRLINE */}
        <View style={[styles.hairline, { backgroundColor: colors.border }]} />

        {/* REVIEWS SECTION */}
        <View style={styles.section}>
          <SectionHeader title="Reviews" />

          {canReview && firstConversationListingId && (
            <TouchableOpacity
              style={styles.rateBtn}
              activeOpacity={0.8}
              onPress={() =>
                router.push(
                  `/review/${firstConversationListingId}?sellerName=${seller.username ?? ''}`
                )
              }
            >
              <Ionicons name="star-outline" size={16} color={colors.primaryText} />
              <Text style={[styles.rateBtnText, { color: colors.primaryText }]}>
                Rate this seller
              </Text>
            </TouchableOpacity>
          )}

          {reviews.length > 0 ? (
            <View>
              {reviews.map((review, index) => (
                <View key={review.id}>
                  <View style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar
                        uri={review.reviewer?.avatar_url}
                        initials={review.reviewer?.username?.[0]?.toUpperCase()}
                        size="small"
                      />
                      <View style={styles.reviewerInfo}>
                        <Text style={styles.reviewerName}>@{review.reviewer?.username}</Text>
                      </View>
                      <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                        {new Date(review.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={styles.reviewRatingRow}>
                      <StarRating rating={review.rating} size={12} />
                      <Text style={[styles.reviewRatingNum, { color: colors.textSecondary }]}>
                        {review.rating.toFixed(1)}
                      </Text>
                    </View>
                    {review.comment ? (
                      <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>
                        {review.comment}
                      </Text>
                    ) : null}
                  </View>
                  {index < reviews.length - 1 && (
                    <View style={[styles.hairline, { backgroundColor: colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No reviews yet
            </Text>
          )}
        </View>

        {/* HAIRLINE */}
        <View style={[styles.hairline, { backgroundColor: colors.border }]} />

        {/* LISTINGS SECTION */}
        <View style={styles.section}>
          <SectionHeader title="Listings" />
          {listings.length > 0 ? (
            <ListingGrid listings={listings} />
          ) : seller?.is_seller && !seller?.is_verified ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Listings coming soon
            </Text>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No active listings
            </Text>
          )}
        </View>
      </ScrollView>

      <SellerCollectionSheet
        visible={selectedCollectionId !== null}
        collectionId={selectedCollectionId}
        collectionName={collections.find(c => c.id === selectedCollectionId)?.name ?? ''}
        onClose={() => setSelectedCollectionId(null)}
        colors={colors}
      />
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1 },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      ...Typography.body,
      fontSize: 16,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
    },

    // Profile section
    profileSection: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xl,
      gap: Spacing.lg,
    },
    profileTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
    },
    profileInfo: {
      flex: 1,
      gap: 4,
    },
    usernameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      flexWrap: 'wrap',
    },
    badgePill: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
    },
    badgePillText: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
    },
    username: {
      ...Typography.subheading,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    joinedText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },

    // Stats
    statsRow: {
      flexDirection: 'row',
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    statValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    statValue: {
      ...Typography.subheading,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    statLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
    },

    // Message button
    messageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    messageBtnText: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
    },

    // Divider
    hairline: {
      height: StyleSheet.hairlineWidth,
    },

    // Sections
    section: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    emptyText: {
      ...Typography.body,
    },

    // Collections grid
    collectionsGrid: {
      gap: Spacing.sm,
    },
    collectionsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    // Rate button
    rateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    rateBtnText: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
    },

    // Review cards
    reviewCard: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
    },
    reviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    reviewerInfo: {
      flex: 1,
    },
    reviewerName: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    reviewDate: {
      ...Typography.caption,
    },
    reviewRatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    reviewRatingNum: {
      ...Typography.caption,
    },
    reviewComment: {
      ...Typography.body,
      lineHeight: 22,
    },
  });
}
