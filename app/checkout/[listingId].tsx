import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface ListingSummary {
  id: string;
  title: string;
  price: number;
  images: string[];
  seller_id: string;
  status: string;
}

interface AddressState {
  address_line1: string;
  address_line2: string | null;
  city: string;
  postcode: string;
  country: string;
}

function calcFee(price: number) {
  return Math.round((price * 0.065 + 0.8) * 100) / 100;
}

function formatGBP(amount: number) {
  return `£${amount.toFixed(2)}`;
}

export default function CheckoutScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [listing, setListing] = useState<ListingSummary | null>(null);
  const [address, setAddress] = useState<AddressState | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user || !listingId) return;
      (async () => {
        setLoading(true);
        const [{ data: listingData }, { data: userData }] = await Promise.all([
          supabase
            .from('listings')
            .select('id, title, price, images, seller_id, status')
            .eq('id', listingId)
            .single(),
          supabase
            .from('users')
            .select('address_line1, address_line2, city, postcode, country')
            .eq('id', user.id)
            .single(),
        ]);

        if (!listingData || listingData.status !== 'available') {
          Alert.alert('Unavailable', 'This listing is no longer available.');
          router.back();
          return;
        }
        if (listingData.seller_id === user.id) {
          Alert.alert('Error', 'You cannot buy your own listing.');
          router.back();
          return;
        }

        setListing(listingData);
        if (userData?.address_line1) {
          setAddress(userData);
        }
        setLoading(false);
      })();
    }, [user, listingId])
  );

  const protectionFee = listing ? calcFee(listing.price) : 0;
  const total = listing ? listing.price + protectionFee : 0;

  const handlePlaceOrder = async () => {
    if (!listing || !user) return;

    if (!address?.address_line1) {
      Alert.alert(
        'No delivery address',
        'Please save a delivery address before placing an order.',
        [
          { text: 'Add address', onPress: () => router.push('/settings/address') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setPlacing(true);

    // Create order (status: 'paid' — mock until payment provider is wired)
    // Snapshot the delivery address so it's fixed even if the buyer updates their profile later.
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        status: 'paid',
        item_price: listing.price,
        protection_fee: protectionFee,
        total_paid: total,
        delivery_address_line1: address!.address_line1,
        delivery_address_line2: address!.address_line2 ?? null,
        delivery_city: address!.city,
        delivery_postcode: address!.postcode,
        delivery_country: address!.country,
      })
      .select('id')
      .single();

    if (error || !order) {
      setPlacing(false);
      Alert.alert('Error', 'Could not place order. Please try again.');
      return;
    }

    // Ensure seller wallet exists (no-op if already created)
    await supabase
      .from('seller_wallet')
      .upsert({ user_id: listing.seller_id }, { onConflict: 'user_id', ignoreDuplicates: true });

    // Mark listing as sold
    await supabase
      .from('listings')
      .update({ status: 'sold', buyer_id: user.id, sold_at: new Date().toISOString() })
      .eq('id', listing.id);

    setPlacing(false);
    router.replace(`/order/${order.id}`);
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Checkout" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (!listing) return null;

  const hasAddress = !!address?.address_line1;
  const addressLine2 = address?.address_line2 ? `\n${address.address_line2}` : '';
  const addressDisplay = hasAddress
    ? `${address!.address_line1}${addressLine2}\n${address!.city}  ${address!.postcode}\n${address!.country}`
    : null;

  return (
    <ScreenWrapper>
      <Header title="Checkout" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Item summary */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Item</Text>
            <View style={styles.itemRow}>
              {listing.images?.[0] ? (
                <Image
                  source={{ uri: listing.images[0] }}
                  style={styles.itemImage}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.itemImage, styles.itemImagePlaceholder, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {listing.title}
                </Text>
                <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                  {formatGBP(listing.price)}
                </Text>
              </View>
            </View>
          </View>

          {/* Delivery address */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Deliver to</Text>
              <TouchableOpacity onPress={() => router.push('/settings/address')} hitSlop={8}>
                <Text style={[styles.editLink, { color: colors.primary }]}>
                  {hasAddress ? 'Edit' : 'Add address'}
                </Text>
              </TouchableOpacity>
            </View>
            {hasAddress ? (
              <Text style={[styles.addressText, { color: colors.textPrimary }]}>
                {addressDisplay}
              </Text>
            ) : (
              <View style={styles.noAddressRow}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.noAddressText, { color: colors.textSecondary }]}>
                  No delivery address saved
                </Text>
              </View>
            )}
          </View>

          {/* Fee breakdown */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Order summary</Text>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textPrimary }]}>Item price</Text>
              <Text style={[styles.feeValue, { color: colors.textPrimary }]}>{formatGBP(listing.price)}</Text>
            </View>
            <View style={styles.feeRow}>
              <View style={styles.feeLabelRow}>
                <Text style={[styles.feeLabel, { color: colors.textPrimary }]}>Buyer protection</Text>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.success} style={{ marginLeft: 4 }} />
              </View>
              <Text style={[styles.feeValue, { color: colors.textPrimary }]}>{formatGBP(protectionFee)}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total</Text>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatGBP(total)}</Text>
            </View>
            <Text style={[styles.protectionNote, { color: colors.textSecondary }]}>
              Buyer protection covers you if the item doesn't arrive or isn't as described.
            </Text>
          </View>
        </ScrollView>

        {/* Place order CTA */}
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Button
            label={`Pay ${formatGBP(total)}`}
            onPress={handlePlaceOrder}
            loading={placing}
            disabled={!hasAddress}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    editLink: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    itemRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    itemImage: {
      width: 72,
      height: 90,
      borderRadius: BorderRadius.medium,
    },
    itemImagePlaceholder: {
      width: 72,
      height: 90,
      borderRadius: BorderRadius.medium,
    },
    itemInfo: {
      flex: 1,
      justifyContent: 'center',
      gap: Spacing.xs,
    },
    itemTitle: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      lineHeight: 20,
    },
    itemPrice: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
    },
    addressText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 22,
    },
    noAddressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    noAddressText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    feeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    feeLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    feeLabel: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    feeValue: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    divider: {
      height: 1,
      marginVertical: Spacing.xs,
    },
    totalLabel: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    totalValue: {
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
    },
    protectionNote: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 17,
    },
    footer: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
      borderTopWidth: 1,
    },
  });
}
