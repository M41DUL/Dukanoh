import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  LayoutAnimation,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { StarRating } from '@/components/StarRating';
import { recordView } from '@/hooks/useRecentlyViewed';

const { width } = Dimensions.get('window');
const IMAGE_HEIGHT = Math.round(width * 1.1);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIndex, setImageIndex] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [sellerListings, setSellerListings] = useState<Listing[]>([]);
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerSending, setOfferSending] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [lowerPriceVisible, setLowerPriceVisible] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [lowerPriceSending, setLowerPriceSending] = useState(false);
  const [bumped, setBumped] = useState(false);
  const [responseRate, setResponseRate] = useState<number | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const imageScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
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
          supabase.rpc('get_seller_response_rate', { p_seller_id: data.seller_id }).then(({ data: rate }) => {
            if (rate !== null) setResponseRate(rate as number);
          });
          supabase
            .from('listings')
            .select('*, seller:users(username, avatar_url)')
            .eq('seller_id', data.seller_id)
            .eq('status', 'available')
            .neq('id', id)
            .order('created_at', { ascending: false })
            .limit(6)
            .then(({ data: others }) => {
              if (others) setSellerListings(others as unknown as Listing[]);
            });
          if (data.status !== 'draft') {
            recordView(id);
            supabase.rpc('increment_view_count', { listing_id: id }).then(() => {
              setListing(prev => prev ? { ...prev, view_count: (prev.view_count ?? 0) + 1 } : prev);
            });
          }
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

  const findOrCreateConversation = async (): Promise<string | null> => {
    if (!user || !id) return null;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', id)
      .eq('buyer_id', user.id)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: created } = await supabase
      .from('conversations')
      .insert({ listing_id: id, buyer_id: user.id, seller_id: listing.seller_id })
      .select('id')
      .single();
    return (created?.id as string) ?? null;
  };

  const handleMessage = async () => {
    const convId = await findOrCreateConversation();
    if (convId) router.push(`/conversation/${convId}`);
  };

  const handleLowerPrice = async () => {
    const amount = parseFloat(newPrice.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0 || amount >= listing.price) return;
    setLowerPriceSending(true);
    await supabase.from('listings').update({ price: amount }).eq('id', id!);
    setListing(prev => prev ? { ...prev, price: amount } : prev);
    setLowerPriceSending(false);
    setLowerPriceVisible(false);
    setNewPrice('');
  };

  const handleMarkSold = () => {
    Alert.alert(
      'Mark as sold',
      'This will hide the listing from the feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as sold',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('listings').update({ status: 'sold' }).eq('id', id!);
            setListing(prev => prev ? { ...prev, status: 'sold' } : prev);
          },
        },
      ]
    );
  };

  const handlePublish = async () => {
    await supabase.from('listings').update({ status: 'available' }).eq('id', id!);
    setListing(prev => prev ? { ...prev, status: 'available' } : prev);
    Alert.alert('Published!', 'Your listing is now live on the feed.');
  };

  const handleDeleteDraft = () => {
    Alert.alert('Delete draft', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('listings').delete().eq('id', id!);
          router.back();
        },
      },
    ]);
  };

  const handleBump = async () => {
    await supabase
      .from('listings')
      .update({ created_at: new Date().toISOString() })
      .eq('id', id!);
    setBumped(true);
    Alert.alert('Listing bumped', 'Your listing is now at the top of the feed.');
  };

  const handleShare = () => {
    Share.share({
      message: `${listing.title} — £${listing.price.toFixed(2)} on Dukanoh`,
    });
  };

  const submitReport = async (reason: string) => {
    if (!user) return;
    await supabase.from('reports').insert({
      reporter_id: user.id,
      listing_id: id!,
      seller_id: listing.seller_id,
      reason,
    });
    Alert.alert('Report submitted', 'Thank you for helping keep Dukanoh safe.');
  };

  const handleReport = () => {
    Alert.alert('Report listing', 'Why are you reporting this?', [
      { text: 'Spam or misleading', onPress: () => submitReport('Spam or misleading') },
      { text: 'Counterfeit or fake', onPress: () => submitReport('Counterfeit or fake') },
      { text: 'Inappropriate content', onPress: () => submitReport('Inappropriate content') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleBlock = () => {
    Alert.alert(
      'Block seller',
      `Block @${listing.seller?.username}? You won't see their listings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await supabase.from('blocked_users').insert({
              blocker_id: user.id,
              blocked_id: listing.seller_id,
            });
            router.back();
          },
        },
      ]
    );
  };

  const handleMoreOptions = () => {
    Alert.alert('Options', undefined, [
      { text: 'Report listing', onPress: handleReport },
      { text: 'Block seller', onPress: handleBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSellerOptions = () => {
    if (listing.status === 'draft') {
      Alert.alert('Manage listing', undefined, [
        { text: 'Edit listing', onPress: () => router.push(`/listing/edit/${id}`) },
        { text: 'Delete draft', style: 'destructive', onPress: handleDeleteDraft },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else if (listing.status === 'available') {
      Alert.alert('Manage listing', undefined, [
        { text: 'Edit listing', onPress: () => router.push(`/listing/edit/${id}`) },
        { text: 'Lower price', onPress: () => setLowerPriceVisible(true) },
        { text: bumped ? 'Already boosted' : 'Boost listing', onPress: handleBump, ...(bumped ? { style: 'destructive' as const } : {}) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleOffer = async () => {
    const amount = parseFloat(offerAmount.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0) { setOfferError('Please enter a valid amount.'); return; }
    if (amount >= listing.price) { setOfferError(`Offer must be less than £${listing.price.toFixed(2)}.`); return; }
    if (!user) return;
    setOfferError('');
    setOfferSending(true);
    const convId = await findOrCreateConversation();
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        listing_id: id!,
        sender_id: user.id,
        receiver_id: listing.seller_id,
        content: `__OFFER__:${amount.toFixed(2)}`,
        created_at: new Date().toISOString(),
      });
    }
    setOfferSending(false);
    setOfferVisible(false);
    setOfferAmount('');
    if (convId) router.push(`/conversation/${convId}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* SOLID HEADER */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <View style={styles.headerRight}>
          {user?.id !== listing.seller_id && (
            <TouchableOpacity style={styles.headerBtn} onPress={() => id && toggleSave(id, listing.price)} activeOpacity={0.8}>
              <Ionicons name={isSaved(id ?? '') ? 'heart' : 'heart-outline'} size={22} color={isSaved(id ?? '') ? '#ff4d6a' : colors.textPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={user?.id === listing.seller_id ? handleSellerOptions : handleMoreOptions} activeOpacity={0.8}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: user?.id !== listing.seller_id && listing.status === 'available' ? 100 + insets.bottom : Spacing['3xl'] }}>

        {/* IMAGE CAROUSEL */}
        <View style={styles.imageContainer}>
          {listing.images?.length > 0 ? (
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {listing.images.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.image} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
          {(listing.images?.length ?? 0) > 1 && (
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>{imageIndex + 1} / {listing.images.length}</Text>
            </View>
          )}
        </View>

        {/* THUMBNAIL STRIP */}
        {(listing.images?.length ?? 0) > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow} style={styles.thumbScroll}>
            {listing.images.map((uri, i) => (
              <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => {
                imageScrollRef.current?.scrollTo({ x: i * width, animated: true });
                setImageIndex(i);
              }}>
                <Image source={{ uri }} style={[styles.thumb, i === imageIndex && styles.thumbActive]} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* CONTENT */}
        <View style={styles.content}>

          {/* Sold banner */}
          {listing.status === 'sold' && user?.id !== listing.seller_id && (
            <View style={styles.soldBanner}>
              <Ionicons name="checkmark-circle" size={14} color={colors.textSecondary} />
              <Text style={styles.soldBannerText}>This item has been sold</Text>
            </View>
          )}

          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{listing.title}</Text>
            {listing.status === 'draft' && <Badge label="Draft" style={styles.draftBadge} />}
          </View>

          {/* Category · Occasion */}
          <Text style={styles.subtitle}>
            {[listing.category, listing.occasion].filter(Boolean).join(' · ')}
          </Text>

          {/* Price */}
          <Text style={styles.price}>£{listing.price?.toFixed(2)}</Text>

          {/* Condition + Size pills */}
          <View style={styles.pillRow}>
            <Badge label={listing.condition} />
            {listing.size ? <Badge label={listing.size} /> : null}
          </View>

          <View style={styles.hairline} />

          {/* CTAs */}
          {user?.id === listing.seller_id ? (
            listing.status === 'draft' ? (
              <View style={styles.ctaSection}>
                <Button label="Publish" onPress={handlePublish} style={{ alignSelf: 'stretch' }} />
                <TouchableOpacity onPress={handleDeleteDraft} activeOpacity={0.7}>
                  <Text style={styles.dangerLink}>Delete draft</Text>
                </TouchableOpacity>
              </View>
            ) : listing.status === 'sold' ? (
              <View style={styles.soldForRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.textSecondary} />
                <Text style={styles.soldForText}>Sold for £{listing.price.toFixed(2)}</Text>
              </View>
            ) : (
              <Button label="Mark as sold" onPress={handleMarkSold} style={{ alignSelf: 'stretch' }} />
            )
          ) : listing.status === 'available' ? (
            <View style={styles.ctaRow}>
              <Button label="Message" onPress={handleMessage} style={styles.ctaBtn} />
              <Button label="Make an offer" variant="outline" onPress={() => setOfferVisible(true)} style={styles.ctaBtn} />
            </View>
          ) : null}

          <View style={styles.hairline} />

          {/* Seller row */}
          <TouchableOpacity style={styles.sellerRow} activeOpacity={0.8} onPress={() => router.push(`/user/${listing.seller_id}`)}>
            <Avatar uri={listing.seller?.avatar_url} initials={listing.seller?.username?.[0]?.toUpperCase()} size="small" />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>@{listing.seller?.username}</Text>
                {(listing.seller?.rating_count ?? 0) > 0 && (
                  <View style={styles.sellerRating}>
                    <StarRating rating={listing.seller?.rating_avg ?? 0} size={11} />
                    <Text style={styles.sellerSub}>{(listing.seller?.rating_avg ?? 0).toFixed(1)}</Text>
                  </View>
                )}
              </View>
              {responseRate !== null && (
                <Text style={styles.sellerSub}>Responds to {responseRate}% of messages</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.hairline} />

          {/* Description (collapsible) */}
          <TouchableOpacity style={styles.sectionRow} onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setDescOpen(v => !v);
          }} activeOpacity={0.7}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Ionicons name={descOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {descOpen && (
            <Text style={styles.description}>{listing.description ?? '—'}</Text>
          )}

          <View style={styles.hairline} />

          {/* Worn at */}
          {listing.worn_at ? (
            <>
              <View style={styles.wornAtRow}>
                <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                <Text style={styles.wornAtText}>{listing.worn_at}</Text>
              </View>
              <View style={styles.hairline} />
            </>
          ) : null}

          {/* Measurements (collapsible) */}
          {listing.measurements && Object.values(listing.measurements).some(v => v != null) && (
            <>
              <TouchableOpacity style={styles.sectionRow} onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMeasureOpen(v => !v);
              }} activeOpacity={0.7}>
                <Text style={styles.sectionLabel}>Measurements</Text>
                <Ionicons name={measureOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              {measureOpen && (
                <View style={styles.measureBody}>
                  {listing.measurements.chest ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Chest</Text>
                      <Text style={styles.measureVal}>{listing.measurements.chest}"</Text>
                    </View>
                  ) : null}
                  {listing.measurements.waist ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Waist</Text>
                      <Text style={styles.measureVal}>{listing.measurements.waist}"</Text>
                    </View>
                  ) : null}
                  {listing.measurements.length ? (
                    <View style={styles.measureLine}>
                      <Text style={styles.measureKey}>Length</Text>
                      <Text style={styles.measureVal}>{listing.measurements.length}"</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <View style={styles.hairline} />
            </>
          )}

          {/* Rate this seller */}
          {canReview && (
            <>
              <TouchableOpacity style={styles.reviewBtn} onPress={() => router.push(`/review/${id}?sellerName=${listing.seller?.username ?? ''}&listingTitle=${encodeURIComponent(listing.title)}`)} activeOpacity={0.8}>
                <Ionicons name="star-outline" size={16} color={colors.primary} />
                <Text style={styles.reviewBtnText}>Rate this seller</Text>
              </TouchableOpacity>
              <View style={styles.hairline} />
            </>
          )}

          <View style={styles.hairline} />

          {/* More from seller */}
          {sellerListings.length > 0 && (
            <>
              <TouchableOpacity style={styles.moreTitleRow} onPress={() => router.push(`/user/${listing.seller_id}`)} activeOpacity={0.8}>
                <Text style={styles.sectionLabel}>More from @{listing.seller?.username}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moreRow} style={styles.moreScroll}>
                {sellerListings.map(item => (
                  <TouchableOpacity key={item.id} style={styles.moreCard} onPress={() => router.push(`/listing/${item.id}`)} activeOpacity={0.8}>
                    {item.images?.[0] ? (
                      <Image source={{ uri: item.images[0] }} style={styles.moreImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.moreImage, { backgroundColor: colors.surface }]} />
                    )}
                    <Text style={styles.morePrice}>£{item.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Views + listed time */}
          <Text style={styles.footerMeta}>
            {(listing.view_count ?? 0) > 0 ? `${listing.view_count} views · ` : ''}
            {listing.created_at ? `Listed ${timeAgo(listing.created_at)}` : ''}
          </Text>

        </View>
      </ScrollView>

      {/* STICKY BOTTOM CTA — buyers only, available listings */}
      {user?.id !== listing.seller_id && listing.status === 'available' && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Button label="Message" onPress={handleMessage} style={styles.ctaBtn} />
          <Button label="Make an offer" variant="outline" onPress={() => setOfferVisible(true)} style={styles.ctaBtn} />
        </View>
      )}

      <Modal
        visible={lowerPriceVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLowerPriceVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setLowerPriceVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Lower price</Text>
            <Text style={styles.modalSubtitle}>Current: £{listing.price.toFixed(2)}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>£</Text>
              <TextInput
                style={styles.amountInput}
                value={newPrice}
                onChangeText={setNewPrice}
                keyboardType="decimal-pad"
                placeholder="New price"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setLowerPriceVisible(false); setNewPrice(''); }}
                style={styles.modalCancelBtn}
              />
              <Button
                label="Update price"
                onPress={handleLowerPrice}
                disabled={!newPrice || lowerPriceSending}
                loading={lowerPriceSending}
                style={styles.modalSendBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={offerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOfferVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setOfferVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Make an offer</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>{listing.title}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>£</Text>
              <TextInput
                style={styles.amountInput}
                value={offerAmount}
                onChangeText={(v) => { setOfferAmount(v); setOfferError(''); }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
            </View>
            {offerError ? <Text style={styles.modalError}>{offerError}</Text> : null}
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setOfferVisible(false); setOfferAmount(''); setOfferError(''); }}
                style={styles.modalCancelBtn}
              />
              <Button
                label="Send offer"
                onPress={handleOffer}
                disabled={!offerAmount || offerSending}
                loading={offerSending}
                style={styles.modalSendBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      flex: 1,
      ...Typography.body,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
      textAlign: 'center',
      marginHorizontal: Spacing.xs,
    },
    headerRight: { flexDirection: 'row' },

    // Image
    imageContainer: { width, height: IMAGE_HEIGHT, backgroundColor: colors.surface },
    image: { width, height: IMAGE_HEIGHT },
    imagePlaceholder: { width, height: IMAGE_HEIGHT, backgroundColor: colors.surface },
    imageCounter: {
      position: 'absolute',
      bottom: Spacing.sm,
      right: Spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    imageCounterText: { ...Typography.caption, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },

    // Thumbnails
    thumbScroll: { backgroundColor: colors.background },
    thumbRow: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    thumb: {
      width: 68,
      height: 68,
      borderRadius: BorderRadius.small,
      borderWidth: 1,
      borderColor: colors.border,
    },
    thumbActive: {
      borderWidth: 2,
      borderColor: colors.textPrimary,
    },

    // Content
    content: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.base,
      gap: Spacing.lg,
    },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

    // Title block
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    title: { ...Typography.heading, color: colors.textPrimary, flex: 1 },
    subtitle: { ...Typography.body, color: colors.textSecondary, marginTop: -Spacing.sm },
    price: { ...Typography.price, color: colors.textPrimary },
    pillRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
    draftBadge: { backgroundColor: colors.surface, borderColor: colors.border },

    // CTAs
    stickyFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.sm,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    ctaRow: { flexDirection: 'row', gap: Spacing.sm },
    ctaBtn: { flex: 1 },
    ctaSection: { gap: Spacing.sm, alignItems: 'center' },
    dangerLink: { ...Typography.body, color: colors.error },
    soldForRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
    soldForText: { ...Typography.subheading, color: colors.textSecondary },

    // Sold banner
    soldBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.small,
    },
    soldBannerText: { ...Typography.body, color: colors.textSecondary },

    // Collapsible sections
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
    },
    sectionLabel: {
      ...Typography.body,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    description: { ...Typography.body, color: colors.textSecondary, lineHeight: 22 },

    // Worn at
    wornAtRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    wornAtText: {
      ...Typography.body,
      color: colors.textSecondary,
      flex: 1,
      lineHeight: 20,
      fontStyle: 'italic',
    },

    // Measurements
    measureBody: { gap: Spacing.xs, paddingBottom: Spacing.sm },
    measureLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
    measureKey: { ...Typography.body, color: colors.textSecondary },
    measureVal: { ...Typography.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },

    // Seller
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, paddingVertical: Spacing.sm },
    sellerInfo: { flex: 1, gap: 2 },
    sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    sellerName: { ...Typography.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    sellerRating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    sellerSub: { ...Typography.caption, color: colors.textSecondary },

    // Review
    reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
    reviewBtnText: { ...Typography.body, color: colors.primary, fontFamily: 'Inter_600SemiBold' },

    // More from seller
    moreTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moreScroll: { marginHorizontal: -Spacing.base },
    moreRow: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs },
    moreCard: { width: 120 },
    moreImage: { width: 120, height: 160, borderRadius: BorderRadius.medium, marginBottom: Spacing.xs },
    morePrice: { ...Typography.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },

    // Footer meta
    footerMeta: { ...Typography.caption, color: colors.textSecondary, textAlign: 'center' },

    // Modals
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: BorderRadius.large,
      borderTopRightRadius: BorderRadius.large,
      padding: Spacing.xl,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    modalTitle: { ...Typography.subheading, color: colors.textPrimary },
    modalSubtitle: { ...Typography.body, color: colors.textSecondary, marginTop: -Spacing.xs },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
      paddingBottom: Spacing.sm,
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    currencySymbol: { ...Typography.heading, color: colors.textPrimary },
    amountInput: { ...Typography.heading, color: colors.textPrimary, flex: 1, padding: 0 },
    modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    modalCancelBtn: { flex: 1 },
    modalSendBtn: { flex: 2 },
    modalError: { ...Typography.caption, color: colors.error },
  });
}
