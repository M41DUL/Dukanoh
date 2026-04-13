import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { calcProtectionFee, calcOrderTotal, formatGBP } from '@/lib/paymentHelpers';

type PaymentMethod = 'apple_pay' | 'google_pay' | 'card';

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

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'apple_pay',  label: 'Apple Pay',  icon: Platform.OS === 'ios' ? 'logo-apple' : 'logo-google' },
  { key: 'google_pay', label: 'Google Pay', icon: 'logo-google' },
  { key: 'card',       label: 'Credit / Debit card', icon: 'card-outline' },
];

// On iOS default to Apple Pay, on Android default to Google Pay
const DEFAULT_METHOD: PaymentMethod = Platform.OS === 'ios' ? 'apple_pay' : 'google_pay';

export default function CheckoutScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [listing, setListing] = useState<ListingSummary | null>(null);
  const [address, setAddress] = useState<AddressState | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(DEFAULT_METHOD);

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
        if (userData?.address_line1) setAddress(userData);
        setLoading(false);
      })();
    }, [user, listingId])
  );

  const protectionFee = listing ? calcProtectionFee(listing.price) : 0;
  const total = listing ? calcOrderTotal(listing.price) : 0;

  const handlePlaceOrder = async () => {
    if (!listing || !user) return;

    if (!address?.address_line1) {
      Alert.alert(
        'No delivery address',
        'Please save a delivery address before placing an order.',
        [
          { text: 'Add address', onPress: () => router.push('/settings/address') },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
      return;
    }

    setPlacing(true);

    // Re-check listing is still available (race condition guard)
    const { data: freshListing } = await supabase
      .from('listings')
      .select('status')
      .eq('id', listing.id)
      .single();

    if (freshListing?.status !== 'available') {
      setPlacing(false);
      Alert.alert('No longer available', 'This listing was just sold. Please browse other items.');
      router.back();
      return;
    }

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
        delivery_address_line1: address?.address_line1,
        delivery_address_line2: address?.address_line2 ?? null,
        delivery_city: address?.city,
        delivery_postcode: address?.postcode,
        delivery_country: address?.country,
      })
      .select('id')
      .single();

    if (error || !order) {
      setPlacing(false);
      Alert.alert('Error', 'Could not place order. Please try again.');
      return;
    }

    const { error: listingError } = await supabase
      .from('listings')
      .update({ status: 'sold', buyer_id: user.id, sold_at: new Date().toISOString() })
      .eq('id', listing.id);

    if (listingError) {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      setPlacing(false);
      Alert.alert('Error', 'Could not complete order. Please try again.');
      return;
    }

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
  const addressLine2 = address?.address_line2 ? `, ${address.address_line2}` : '';
  const addressOneLine = hasAddress
    ? `${address?.address_line1}${addressLine2}, ${address?.city}, ${address?.postcode}`
    : null;

  return (
    <ScreenWrapper>
      <Header title="Checkout" showBack />

      <View style={styles.inner}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Order summary ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Order summary</Text>
          <View style={styles.itemRow}>
            {listing.images?.[0] ? (
              <Image
                source={{ uri: getImageUrl(listing.images[0], 'thumbnail') }}
                style={styles.itemImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: colors.surface }]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {listing.title}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Delivery ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery</Text>
            <TouchableOpacity onPress={() => router.push('/settings/address')} hitSlop={8}>
              <Text style={[styles.sectionAction, { color: colors.primary }]}>
                {hasAddress ? 'Change' : 'Add address'}
              </Text>
            </TouchableOpacity>
          </View>

          {hasAddress ? (
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {addressOneLine}
            </Text>
          ) : (
            <View style={styles.inlineAlert}>
              <Ionicons name="location-outline" size={15} color={colors.error} />
              <Text style={[styles.inlineAlertText, { color: colors.error }]}>
                No delivery address saved
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Payment method ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Payment</Text>
          </View>

          <View style={styles.paymentOptions}>
            {PAYMENT_OPTIONS.map(option => {
              const active = selectedMethod === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.paymentOption,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? `${colors.primary}08` : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedMethod(option.key)}
                  activeOpacity={0.75}
                >
                  <View style={styles.paymentOptionLeft}>
                    <Ionicons
                      name={option.icon as any}
                      size={18}
                      color={active ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        { color: active ? colors.textPrimary : colors.textSecondary },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </View>
                  <View style={[
                    styles.radioOuter,
                    { borderColor: active ? colors.primary : colors.border },
                  ]}>
                    {active && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedMethod === 'card' && (
            <View style={[styles.cardPlaceholder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.cardPlaceholderText, { color: colors.textSecondary }]}>
                Card details — available when payments go live
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Price breakdown + total ───────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Item price</Text>
            <Text style={[styles.feeValue, { color: colors.textSecondary }]}>{formatGBP(listing.price)}</Text>
          </View>
          <View style={styles.feeRow}>
            <View style={styles.feeLabelRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Buyer protection</Text>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[styles.feeValue, { color: colors.textSecondary }]}>{formatGBP(protectionFee)}</Text>
          </View>
          <View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} />
          <View style={styles.feeRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total (tax included)</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatGBP(total)}</Text>
          </View>
          <Text style={[styles.protectionNote, { color: colors.textSecondary }]}>
            Buyer protection covers you if the item doesn't arrive or isn't as described.
          </Text>
        </View>
      </ScrollView>

      {/* ── Sticky CTA ────────────────────────────────────────── */}
      <View style={[styles.stickyBar, {
        borderTopColor: colors.border,
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + Spacing.sm,
      }]}>
        <Button
          label={`Submit Payment · ${formatGBP(total)}`}
          onPress={handlePlaceOrder}
          loading={placing}
          disabled={!hasAddress}
        />
        {!hasAddress && (
          <Text style={[styles.disabledNote, { color: colors.textSecondary }]}>
            Add a delivery address to continue
          </Text>
        )}
      </View>
      </View>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    inner: {
      flex: 1,
    },
    scroll: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['2xl'],
    },
    section: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    sectionAction: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    sectionBody: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 20,
    },
    inlineAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    inlineAlertText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: -Spacing.base,
    },
    paymentOptions: {
      gap: Spacing.sm,
    },
    paymentOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    paymentOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    paymentOptionLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    cardPlaceholder: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderStyle: 'dashed',
    },
    cardPlaceholderText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    itemRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'center',
    },
    itemImage: {
      width: 64,
      height: 80,
      borderRadius: BorderRadius.small,
    },
    itemInfo: {
      flex: 1,
      gap: Spacing.xs,
    },
    itemTitle: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      lineHeight: 20,
    },
    itemPrice: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    breakdown: {
      gap: Spacing.sm,
    },
    breakdownDivider: {
      height: StyleSheet.hairlineWidth,
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
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    feeValue: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    protectionNote: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      lineHeight: 17,
    },
    totalLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    totalValue: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
    },
    stickyBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: Spacing.base,
      gap: Spacing.sm,
    },
    disabledNote: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
  });
}
