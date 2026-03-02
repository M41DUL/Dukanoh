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
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerSending, setOfferSending] = useState(false);
  const [lowerPriceVisible, setLowerPriceVisible] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [lowerPriceSending, setLowerPriceSending] = useState(false);
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

          <View style={styles.priceRow}>
            <Text style={styles.price}>£{listing.price?.toFixed(2)}</Text>
            {listing.status === 'sold' && (
              <Badge label="Sold" active style={styles.soldBadge} />
            )}
          </View>
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
        {user?.id === listing.seller_id ? (
          listing.status === 'sold' ? (
            <View style={styles.soldFooter}>
              <Ionicons name="checkmark-circle" size={18} color={colors.textSecondary} />
              <Text style={styles.soldFooterText}>Marked as sold</Text>
            </View>
          ) : (
            <>
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
                color={isSaved(id ?? '') ? '#FF4444' : colors.textPrimary}
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
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    price: { ...Typography.heading, color: colors.primary },
    soldBadge: { backgroundColor: '#FF4444', borderColor: '#FF4444' },
    conditionBadge: { alignSelf: 'flex-start' },
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
  });
}
