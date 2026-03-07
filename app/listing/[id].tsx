import React, { useState, useEffect, useMemo } from 'react';
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
  Linking,
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
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { Listing } from '@/components/ListingCard';
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { StarRating } from '@/components/StarRating';
import { recordView } from '@/hooks/useRecentlyViewed';

const { width } = Dimensions.get('window');

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
  const [lowerPriceVisible, setLowerPriceVisible] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [lowerPriceSending, setLowerPriceSending] = useState(false);
  const [bumped, setBumped] = useState(false);
  const [responseRate, setResponseRate] = useState<number | null>(null);
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

  const handleWhatsAppShare = async () => {
    const text = encodeURIComponent(`${listing.title} — £${listing.price.toFixed(2)} on Dukanoh`);
    const url = `whatsapp://send?text=${text}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Share.share({ message: `${listing.title} — £${listing.price.toFixed(2)} on Dukanoh` });
    }
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

  const handleOffer = async () => {
    const amount = parseFloat(offerAmount.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0 || !user) return;
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
    <ScreenWrapper>
      <Header
        showBack
        rightAction={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleWhatsAppShare} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            {user?.id !== listing.seller_id && (
              <TouchableOpacity onPress={handleMoreOptions} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        }
      />
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
                <View style={styles.imageCounter}>
                  <Text style={styles.imageCounterText}>
                    {imageIndex + 1} / {listing.images.length}
                  </Text>
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

          <View style={styles.priceRow}>
            <Text style={styles.price}>£{listing.price?.toFixed(2)}</Text>
            {listing.status === 'sold' && (
              <Badge label="Sold" active style={styles.soldBadge} />
            )}
            {listing.status === 'draft' && (
              <Badge label="Draft" style={styles.draftBadge} />
            )}
          </View>
          <View style={styles.metaRow}>
            <Badge label={listing.condition} />
            {listing.size ? <Badge label={listing.size} /> : null}
            {listing.occasion ? <Badge label={listing.occasion} /> : null}
          </View>

          {listing.measurements && (Object.values(listing.measurements).some(v => v != null)) && (
            <View style={styles.measureRow}>
              {listing.measurements.chest ? (
                <View style={styles.measureItem}>
                  <Text style={styles.measureValue}>{listing.measurements.chest}"</Text>
                  <Text style={styles.measureLabel}>Chest</Text>
                </View>
              ) : null}
              {listing.measurements.waist ? (
                <View style={styles.measureItem}>
                  <Text style={styles.measureValue}>{listing.measurements.waist}"</Text>
                  <Text style={styles.measureLabel}>Waist</Text>
                </View>
              ) : null}
              {listing.measurements.length ? (
                <View style={styles.measureItem}>
                  <Text style={styles.measureValue}>{listing.measurements.length}"</Text>
                  <Text style={styles.measureLabel}>Length</Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.viewRow}>
            {(listing.view_count ?? 0) > 0 && (
              <>
                <Ionicons name="eye-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.viewCount}>{listing.view_count} views</Text>
                <Text style={styles.viewCount}>·</Text>
              </>
            )}
            {listing.created_at && (
              <Text style={styles.viewCount}>Listed {timeAgo(listing.created_at)}</Text>
            )}
          </View>

          <Divider />

          <TouchableOpacity style={styles.sellerRow} activeOpacity={0.8} onPress={() => router.push(`/user/${listing.seller_id}`)}>
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
              {responseRate !== null && (
                <View style={styles.responseRow}>
                  <Ionicons name="chatbubble-outline" size={11} color={colors.textSecondary} />
                  <Text style={styles.sellerSub}>Responds to {responseRate}% of messages</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <Divider />

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{listing.description ?? '—'}</Text>

          {listing.worn_at ? (
            <View style={styles.wornAtCard}>
              <Ionicons name="sparkles-outline" size={14} color={colors.primaryText} />
              <Text style={styles.wornAtText}>{listing.worn_at}</Text>
            </View>
          ) : null}

          {canReview && (
            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => router.push(`/review/${id}?sellerName=${listing.seller?.username ?? ''}&listingTitle=${encodeURIComponent(listing.title)}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="star-outline" size={16} color={colors.primaryText} />
              <Text style={styles.reviewBtnText}>Rate this seller</Text>
            </TouchableOpacity>
          )}

          {sellerListings.length > 0 && (
            <>
              <Divider />
              <TouchableOpacity
                style={styles.moreTitleRow}
                onPress={() => router.push(`/user/${listing.seller_id}`)}
                activeOpacity={0.8}
              >
                <Text style={styles.sectionLabel}>More from @{listing.seller?.username}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moreRow}
                style={styles.moreScroll}
              >
                {sellerListings.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.moreCard}
                    onPress={() => router.push(`/listing/${item.id}`)}
                    activeOpacity={0.8}
                  >
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
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {user?.id === listing.seller_id ? (
          listing.status === 'draft' ? (
            <>
              <Button
                label="Delete draft"
                variant="outline"
                onPress={handleDeleteDraft}
                style={styles.offerBtn}
              />
              <Button
                label="Publish"
                onPress={handlePublish}
                style={styles.messageBtn}
              />
            </>
          ) : listing.status === 'sold' ? (
            <View style={styles.soldFooter}>
              <Ionicons name="checkmark-circle" size={18} color={colors.textSecondary} />
              <Text style={styles.soldFooterText}>Marked as sold</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.footerIconBtn}
                onPress={handleBump}
                disabled={bumped}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-up-circle-outline"
                  size={24}
                  color={bumped ? colors.textSecondary : colors.primaryText}
                />
              </TouchableOpacity>
              <Button
                label="Lower price"
                variant="outline"
                onPress={() => setLowerPriceVisible(true)}
                style={styles.offerBtn}
              />
              <Button
                label="Mark as sold"
                onPress={handleMarkSold}
                style={styles.messageBtn}
              />
            </>
          )
        ) : (
          <>
            <TouchableOpacity
              style={styles.footerIconBtn}
              onPress={() => id && toggleSave(id, listing.price)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSaved(id ?? '') ? 'heart' : 'heart-outline'}
                size={24}
                color={isSaved(id ?? '') ? colors.error : colors.textPrimary}
              />
            </TouchableOpacity>
            {listing.status === 'available' && (
              <Button
                label="Make offer"
                variant="outline"
                onPress={() => setOfferVisible(true)}
                style={styles.offerBtn}
              />
            )}
            <Button
              label="Message Seller"
              onPress={handleMessage}
              style={styles.messageBtn}
            />
          </>
        )}
      </View>

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
                onChangeText={setOfferAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setOfferVisible(false); setOfferAmount(''); }}
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
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    imageBreakout: { marginHorizontal: -Spacing.base },
    imageContainer: { width, height: 360, backgroundColor: colors.surface },
    image: { width, height: 360 },
    imagePlaceholder: { flex: 1 },
    imageCounter: {
      position: 'absolute',
      bottom: Spacing.sm,
      right: Spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 12,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    imageCounterText: {
      ...Typography.caption,
      color: '#fff',
      fontFamily: 'Inter_600SemiBold',
    },
    content: { paddingVertical: Spacing.base, gap: Spacing.sm },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    title: { ...Typography.heading, color: colors.textPrimary, flex: 1 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    price: { ...Typography.heading, color: colors.primaryText },
    soldBadge: { backgroundColor: colors.error, borderColor: colors.error },
    draftBadge: { backgroundColor: colors.surface, borderColor: colors.border },
    metaRow: { flexDirection: 'row', gap: Spacing.xs },
    measureRow: {
      flexDirection: 'row',
      gap: Spacing.xl,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.base,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
    },
    measureItem: { alignItems: 'center', gap: 2 },
    measureValue: { ...Typography.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    measureLabel: { ...Typography.caption, color: colors.textSecondary },
    viewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewCount: { ...Typography.caption, color: colors.textSecondary },
    soldFooter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
    },
    soldFooterText: { ...Typography.body, color: colors.textSecondary },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
    },
    sellerInfo: { flex: 1, gap: 2 },
    sellerName: { ...Typography.body, color: colors.textPrimary, fontWeight: '600' },
    sellerRating: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    responseRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sellerSub: { ...Typography.caption, color: colors.textSecondary },
    reviewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      alignSelf: 'flex-start',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.primary,
      marginTop: Spacing.xs,
    },
    reviewBtnText: {
      ...Typography.label,
      color: colors.primaryText,
    },
    sectionLabel: { ...Typography.label, color: colors.textPrimary },
    description: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    wornAtCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.xs,
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderRadius: BorderRadius.small,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      marginTop: Spacing.xs,
    },
    wornAtText: {
      ...Typography.body,
      color: colors.textSecondary,
      flex: 1,
      lineHeight: 20,
      fontStyle: 'italic',
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
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    offerBtn: { flex: 1 },
    messageBtn: { flex: 1 },
    // Offer modal
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
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
    amountInput: {
      ...Typography.heading,
      color: colors.textPrimary,
      flex: 1,
      padding: 0,
    },
    modalActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    modalCancelBtn: { flex: 1 },
    modalSendBtn: { flex: 2 },
    moreTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.sm,
    },
    moreScroll: { marginHorizontal: -Spacing.base },
    moreRow: { paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xs },
    moreCard: { width: 100 },
    moreImage: {
      width: 100,
      height: 130,
      borderRadius: BorderRadius.medium,
      marginBottom: Spacing.xs,
    },
    morePrice: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
