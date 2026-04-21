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
import { useStripe, usePlatformPay, PlatformPay, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, FontFamily, Typography, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { calcProtectionFee, calcOrderTotal, formatGBP } from '@/lib/paymentHelpers';
import { edgeFetch } from '@/lib/edgeFetch';

type PaymentMethod = 'apple_pay' | 'google_pay' | 'card';

interface ListingSummary {
  id: string;
  title: string;
  price: number;
  images: string[];
  seller_id: string;
  status: string;
  size: string | null;
  condition: string | null;
}

interface AddressState {
  address_line1: string;
  address_line2: string | null;
  city: string;
  postcode: string;
  country: string;
}

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: string }[] = Platform.OS === 'ios'
  ? [
      { key: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple' },
      { key: 'card',      label: 'Credit / Debit card', icon: 'card-outline' },
    ]
  : [
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
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { confirmPlatformPayPayment } = usePlatformPay();

  const [listing, setListing] = useState<ListingSummary | null>(null);
  const [address, setAddress] = useState<AddressState | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(DEFAULT_METHOD);
  const [protectionSheetVisible, setProtectionSheetVisible] = useState(false);

  // Check platform pay support on mount
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      isPlatformPaySupported().then(setApplePaySupported);
    } else if (Platform.OS === 'android') {
      isPlatformPaySupported({ googlePay: { testEnv: __DEV__ } }).then(setGooglePaySupported);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user || !listingId) return;
      (async () => {
        setLoading(true);
        const [{ data: listingData }, { data: userData }] = await Promise.all([
          supabase
            .from('listings')
            .select('id, title, price, images, seller_id, status, size, condition')
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

        setListing(listingData as unknown as ListingSummary);
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

    // Step 1 — Create PaymentIntent via Edge Function
    const piRes = await edgeFetch('create-payment-intent', { listing_id: listing.id });

    if (!piRes.ok) {
      const err = await piRes.json().catch(() => ({}));
      setPlacing(false);
      if (err?.error === 'Listing is no longer available') {
        Alert.alert('No longer available', 'This listing was just sold. Please browse other items.');
        router.back();
      } else if (err?.error === 'Seller has not completed verification') {
        Alert.alert('Seller not verified', 'This seller has not completed verification yet. Try messaging them.');
        router.back();
      } else {
        Alert.alert('Payment error', err?.error ?? 'Could not start checkout. Please try again.');
      }
      return;
    }

    const { client_secret, payment_intent_id, seller_verified } = await piRes.json();

    // Step 2 — Pay: native wallet if supported, else card PaymentSheet
    if (applePaySupported && Platform.OS === 'ios' && selectedMethod !== 'card') {
      const { error: applePayError } = await confirmPlatformPayPayment(client_secret, {
        applePay: {
          cartItems: [
            {
              label: listing.title,
              amount: listing.price.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
            {
              label: 'Dukanoh Safe Checkout',
              amount: protectionFee.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
            {
              label: 'Dukanoh',
              amount: total.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
        },
      });

      if (applePayError) {
        setPlacing(false);
        if (applePayError.code !== 'Canceled') {
          Alert.alert('Payment failed', applePayError.message);
        }
        return;
      }
    } else if (googlePaySupported && Platform.OS === 'android' && selectedMethod !== 'card') {
      const { error: googlePayError } = await confirmPlatformPayPayment(client_secret, {
        googlePay: {
          testEnv: __DEV__,
          merchantName: 'Dukanoh',
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
        },
      });

      if (googlePayError) {
        setPlacing(false);
        if (googlePayError.code !== 'Canceled') {
          Alert.alert('Payment failed', googlePayError.message);
        }
        return;
      }
    } else {
      // Fallback: card PaymentSheet (Android / no Apple Pay)
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Dukanoh',
        returnURL: 'dukanoh://checkout/complete',
        paymentMethodOrder: ['card'],
        appearance: {
          colors: {
            primary: colors.primary,
            background: colors.background,
            componentBackground: colors.surface,
            componentBorder: colors.border,
            componentDivider: colors.border,
            primaryText: colors.textPrimary,
            secondaryText: colors.textSecondary,
            componentText: colors.textPrimary,
            placeholderText: colors.textSecondary,
            icon: colors.textSecondary,
            error: colors.error,
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
          primaryButton: {
            colors: {
              background: colors.primary,
              text: '#FFFFFF',
              border: colors.primary,
            },
            shapes: {
              borderRadius: 24,
            },
          },
          font: {
            family: 'Inter',
          },
        },
      });

      if (initError) {
        setPlacing(false);
        Alert.alert('Payment error', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setPlacing(false);
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }
    }

    // Step 4 — Payment succeeded: insert the order record
    // If seller isn't verified yet, set a 7-day deadline for them to complete onboarding
    const sellerVerifyDeadline = seller_verified
      ? null
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        status: 'paid',
        item_price: listing.price,
        protection_fee: protectionFee,
        total_paid: total,
        stripe_payment_id: payment_intent_id,
        seller_verify_deadline: sellerVerifyDeadline,
        delivery_address_line1: address?.address_line1,
        delivery_address_line2: address?.address_line2 ?? null,
        delivery_city: address?.city,
        delivery_postcode: address?.postcode,
        delivery_country: address?.country,
      })
      .select('id')
      .single();

    if (orderError || !order) {
      setPlacing(false);
      if ((orderError as { code?: string })?.code === '23505') {
        // Unique constraint on listing_id fired — check if it's our own order
        const { data: existing } = await supabase
          .from('orders')
          .select('id, buyer_id')
          .eq('listing_id', listing.id)
          .single();
        if (existing?.buyer_id === user.id) {
          router.replace(`/order/${existing.id}?fromCheckout=true`);
        } else {
          Alert.alert('Just missed it', 'Someone just bought this item. Browse to find something else.');
          router.back();
        }
      } else {
        Alert.alert('Error', 'Payment taken but order could not be saved. Please contact support.');
      }
      return;
    }

    // Step 5 — Mark listing as sold
    await supabase
      .from('listings')
      .update({ status: 'sold', buyer_id: user.id, sold_at: new Date().toISOString() })
      .eq('id', listing.id);

    setPlacing(false);
    router.replace(`/order/${order.id}?fromCheckout=true`);
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
        <View style={[styles.section, { paddingTop: 0 }]}>
          <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
            {listing.images?.[0] ? (
              <Image
                source={{ uri: getImageUrl(listing.images[0], 'thumbnail') }}
                style={styles.itemImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: colors.surfaceAlt }]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {listing.title}
              </Text>
              {(listing.size || listing.condition) && (
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {[listing.size, listing.condition].filter(Boolean).join(' · ')}
                </Text>
              )}
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
                Enter card details at the next step
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
          <TouchableOpacity
            style={styles.feeRow}
            onPress={() => setProtectionSheetVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.feeLabelRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Dukanoh Safe Checkout</Text>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[styles.feeValue, { color: colors.textSecondary }]}>{formatGBP(protectionFee)}</Text>
          </TouchableOpacity>
          <View style={[styles.inlineDivider, { backgroundColor: colors.border }]} />
          <View style={styles.feeRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total (tax included)</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatGBP(total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky CTA ────────────────────────────────────────── */}
      <View style={[styles.stickyBar, {
        borderTopColor: colors.border,
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + Spacing.sm,
      }]}>
        <Button
          label={applePaySupported && Platform.OS === 'ios' ? ` Pay · ${formatGBP(total)}` : `Pay · ${formatGBP(total)}`}
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

      {/* ── Safe Checkout sheet ──────────────────────────────── */}
      <BottomSheet
        visible={protectionSheetVisible}
        onClose={() => setProtectionSheetVisible(false)}
      >
        <Text style={styles.modalTitle}>Price breakdown</Text>

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownIconWrap}>
            <Ionicons name="pricetag-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={styles.breakdownInfo}>
            <Text style={styles.breakdownLabel} numberOfLines={1}>{listing.title}</Text>
            <Text style={styles.breakdownValue}>£{listing.price.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.breakdownDivider} />

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={styles.breakdownInfo}>
            <Text style={styles.breakdownLabel}>Dukanoh Safe Checkout</Text>
            <Text style={styles.breakdownValue}>£{protectionFee.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.breakdownDivider} />

        <View style={[styles.breakdownRow, { marginTop: Spacing.md }]}>
          <View style={styles.breakdownInfo}>
            <Text style={[styles.breakdownLabel, { fontFamily: FontFamily.semibold }]}>Total Including Buyer Protect</Text>
            <Text style={[styles.breakdownValue, { fontFamily: FontFamily.semibold }]}>£{total.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.breakdownNote}>
          Every purchase on Dukanoh comes with Buyer Protect included. If your item doesn't arrive or doesn't match the listing, we've got you covered.
        </Text>
      </BottomSheet>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
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
    itemCard: {
      flexDirection: 'row',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
    },
    itemImage: {
      width: 100,
      height: 125,
      borderRadius: BorderRadius.medium,
      flexShrink: 0,
    },
    itemInfo: {
      flex: 1,
      gap: 4,
      justifyContent: 'flex-start',
      paddingTop: 2,
    },
    itemTitle: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      lineHeight: 20,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    inlineDivider: {
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
    modalTitle: { ...Typography.subheading, color: colors.textPrimary, marginBottom: Spacing.base, textAlign: 'center' },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      paddingVertical: Spacing.md,
    },
    breakdownIconWrap: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    breakdownInfo: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    breakdownLabel: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    breakdownValue: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    breakdownDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    breakdownNote: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginTop: Spacing.xl,
      lineHeight: 18,
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
