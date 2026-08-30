import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
  BackHandler,
} from 'react-native';
import { useStripe, usePlatformPay, PlatformPay, PaymentIntent, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import type { ComponentProps } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { QueryStateView } from '@/components/QueryStateView';
import { Spacing, BorderRadius, FontFamily, Typography, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { calcProtectionFee, calcOrderTotal, formatGBP } from '@/lib/paymentHelpers';
import { useFeeConfig } from '@/context/FeeConfigContext';
import { edgeFetch } from '@/lib/edgeFetch';
import { GOOGLE_PAY_MARK, APPLE_PAY_MARK } from '@/constants/paymentMarks';
import { PaymentSuccessView } from '@/components/PaymentSuccessView';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type PaymentMethod = 'apple_pay' | 'google_pay' | 'card';

interface ListingSummary {
  id: string;
  title: string;
  price: number;
  images: string[] | null;
  seller_id: string;
  status: string | null;
  size: string | null;
  condition: string | null;
  seller: { username: string | null } | null;
}

// What the buyer paid, captured at the moment payment succeeded. Amounts come
// from the edge function's response, not the local estimate — this is a receipt,
// so it has to match the charge exactly.
interface PaidState {
  orderId: string;
  totalPaid: number;
  protectionFee: number;
  paidWith: PaymentMethod;
  processing: boolean;
}

interface AddressState {
  address_line1: string;
  address_line2: string | null;
  city: string;
  postcode: string;
  country: string;
}

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: IoniconName }[] = Platform.OS === 'ios'
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

// Google Pay refuses production payments until the app's integration is granted
// production access in the Google Pay & Wallet Console, and surfaces it as
// "error 405: This merchant has not completed registration" / OR_BIBED_11.
// PlatformPayError only carries Canceled / Failed / Unknown, so the message text
// is the only signal we get.
const MERCHANT_NOT_REGISTERED = /error 405|not completed registration|OR_BIBED/i;

// Set the first time Google Pay tells us that. Module-scoped so it outlives this
// screen: a member who hits it once shouldn't be dropped back into a method we
// know will fail on their next checkout. Google Pay stays in the payment list
// either way — we only stop pre-selecting it. Nothing sets this once production
// access is granted, so it reverts itself with no code change.
let googlePayUnavailable = false;

export default function CheckoutScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { feePercent, feeFlat } = useFeeConfig();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { confirmPlatformPayPayment } = usePlatformPay();
  const queryClient = useQueryClient();

  const [address, setAddress] = useState<AddressState | null>(null);
  const [placing, setPlacing] = useState(false);
  // Non-null once payment has gone through: swaps the form out for the success
  // screen. Deliberately local state rather than a route — it renders instantly
  // with what we already know, and there's no back stack to get stranded in.
  const [paid, setPaid] = useState<PaidState | null>(null);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  // Whether the wallet-support probe has resolved. Until it has, we can't tell
  // "unsupported" from "not checked yet", so we don't act on the result.
  const [walletChecked, setWalletChecked] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    googlePayUnavailable && DEFAULT_METHOD === 'google_pay' ? 'card' : DEFAULT_METHOD
  );
  const [protectionSheetVisible, setProtectionSheetVisible] = useState(false);
  // Once the buyer has begun paying, the listing flipping to `sold` is the
  // expected result of THEIR OWN purchase (the webhook marks it sold the moment
  // payment succeeds). Without this guard, the focus-refetch below sees `sold`
  // and fires the "Unavailable" alert + router.back(), clobbering the success
  // navigation to the order screen. Set true at checkout start; never reset.
  const checkoutStartedRef = useRef(false);

  // Check platform pay support on mount
  useEffect(() => {
    if (Platform.OS === 'ios') {
      isPlatformPaySupported()
        .then(setApplePaySupported)
        .catch(() => setApplePaySupported(false))
        .finally(() => setWalletChecked(true));
    } else if (Platform.OS === 'android') {
      isPlatformPaySupported({ googlePay: { testEnv: __DEV__ } })
        .then(setGooglePaySupported)
        .catch(() => setGooglePaySupported(false))
        .finally(() => setWalletChecked(true));
    } else {
      setWalletChecked(true);
    }
  }, []);

  // Only offer a wallet this device can actually use. Otherwise the option is
  // shown regardless of support and picking it silently falls back to the card
  // sheet — the buyer gets a payment method they didn't choose.
  const walletSupported = Platform.OS === 'ios' ? applePaySupported : googlePaySupported;

  const paymentOptions = useMemo(
    () => PAYMENT_OPTIONS.filter(o => o.key === 'card' || walletSupported),
    [walletSupported]
  );

  // Default is the wallet; fall back to card once we know it's unavailable.
  useEffect(() => {
    if (walletChecked && !walletSupported && selectedMethod !== 'card') {
      setSelectedMethod('card');
    }
  }, [walletChecked, walletSupported, selectedMethod]);

  // Listing read shares the queryKeys.listings.detail cache with listing/[id]
  // and the browse caches — arriving from the listing page is an instant cache
  // hit. Selects the same column set as listing/[id] to keep cache shape
  // consistent regardless of which screen populates the entry first.
  const listingQuery = useQuery({
    queryKey: queryKeys.listings.detail(listingId),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, title, description, price, original_price, price_dropped_at, images, status, category, gender, condition, occasion, size, colour, fabric, worn_at, measurements, created_at, seller_id, save_count, view_count, collection_id, seller:users!listings_seller_id_fkey(username, avatar_url, rating_avg, rating_count, created_at, seller_tier, tax_hold)'
        )
        .eq('id', listingId!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as ListingSummary | null;
    },
    enabled: !!listingId,
  });

  useRefreshOnFocus(listingQuery.refetch);

  const listing = listingQuery.data ?? null;

  // Address fetch is intentionally NOT migrated — it's a user-row read
  // outside the listing/orders cache namespaces. Refetched on focus so a
  // round-trip through /settings/address picks up the new address.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        const { data: userData } = await supabase
          .from('user_private')
          .select('address_line1, address_line2, city, postcode, country')
          .eq('user_id', user.id)
          .single();
        if (userData?.address_line1) {
          setAddress({
            address_line1: userData.address_line1,
            address_line2: userData.address_line2,
            city: userData.city ?? '',
            postcode: userData.postcode ?? '',
            country: userData.country ?? '',
          });
        }
      })();
    }, [user])
  );

  // Validation on listing data — runs whenever the cached entry updates,
  // including a stale `available` row flipping to `sold` while the user is
  // on this screen.
  useEffect(() => {
    if (!user || !listing) return;
    // Don't bounce the buyer once their own checkout is underway — the listing
    // going `sold` here is their successful purchase, not someone else's.
    if (checkoutStartedRef.current) return;
    if (listing.status !== 'available') {
      Alert.alert('Unavailable', 'This listing is no longer available.');
      router.back();
      return;
    }
    if (listing.seller_id === user.id) {
      Alert.alert('Error', 'You cannot buy your own listing.');
      router.back();
    }
  }, [listing, user]);

  const protectionFee = listing ? calcProtectionFee(listing.price, feePercent, feeFlat) : 0;
  const total = listing ? calcOrderTotal(listing.price, feePercent, feeFlat) : 0;

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

    // From here on, a listing → `sold` transition is this buyer's own purchase,
    // so suppress the "Unavailable" validation bounce (see checkoutStartedRef).
    checkoutStartedRef.current = true;
    setPlacing(true);

    // Step 1 — Create PaymentIntent via Edge Function
    const piRes = await edgeFetch('create-payment-intent', { listing_id: listing.id });

    if (!piRes.ok) {
      const err = await piRes.json().catch(() => ({}));
      setPlacing(false);
      if (err?.error === 'Listing is no longer available') {
        Alert.alert('No longer available', 'This listing was just sold. Please browse other items.');
        router.back();
      } else {
        Alert.alert('Payment error', err?.error ?? 'Could not start checkout. Please try again.');
      }
      return;
    }

    // `order_id` is the reservation row create-payment-intent already inserted
    // (status 'pending') to lock the listing before charging. It is the order —
    // there is no second row to create once payment succeeds. `amount` and
    // `protection_fee` come back in pence and are what Stripe actually charged,
    // which is what the receipt has to show.
    const { client_secret, order_id, amount, protection_fee } = await piRes.json();

    // Wallet sheets hand back the PaymentIntent; PaymentSheet doesn't. Stays
    // null on the card path, which is fine — see the check below.
    let intentStatus: PaymentIntent.Status | null = null;
    // Which method actually took the money. Not the same as `selectedMethod`:
    // an unsupported wallet silently falls through to the card sheet below.
    let paidWith: PaymentMethod = 'card';

    // Step 2 — Pay: native wallet if supported, else card PaymentSheet
    if (applePaySupported && Platform.OS === 'ios' && selectedMethod !== 'card') {
      const { error: applePayError, paymentIntent } = await confirmPlatformPayPayment(client_secret, {
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
      intentStatus = paymentIntent?.status ?? null;
      paidWith = 'apple_pay';
    } else if (googlePaySupported && Platform.OS === 'android' && selectedMethod !== 'card') {
      const { error: googlePayError, paymentIntent } = await confirmPlatformPayPayment(client_secret, {
        googlePay: {
          testEnv: __DEV__,
          merchantName: 'Dukanoh',
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
        },
      });

      if (googlePayError) {
        setPlacing(false);
        if (googlePayError.code === 'Canceled') return;
        // Google's own copy here tells the member to go and verify a merchant
        // registration in the Business Console, which is meaningless to someone
        // trying to buy a piece. Move them to card and say so plainly — the
        // reservation and PaymentIntent are reused on the retry.
        if (MERCHANT_NOT_REGISTERED.test(googlePayError.message ?? '')) {
          googlePayUnavailable = true;
          setSelectedMethod('card');
          Alert.alert(
            "Google Pay isn't available yet",
            "We've switched you to card. Tap Buy Now to finish your order."
          );
          return;
        }
        Alert.alert('Payment failed', googlePayError.message);
        return;
      }
      intentStatus = paymentIntent?.status ?? null;
      paidWith = 'google_pay';
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
          // Stripe Android requires `font.family` to be the filename of a
          // font baked into android/app/src/main/res/font (lowercase, no
          // extension). We load Inter via JS at runtime, not as an Android
          // font resource — so passing 'Inter' here crashes the PaymentSheet
          // init on Android with a "should only contain lowercase
          // alphanumeric characters" error. Set the custom family on iOS only
          // and let Android fall back to its system font for the sheet.
          ...(Platform.OS === 'ios' ? { font: { family: 'Inter' } } : {}),
        },
      });

      if (initError) {
        setPlacing(false);
        // Unlike the errors below, this one is a CONFIGURATION failure, not a
        // payment one — the sheet never opened. Stripe's text here is written
        // for whoever wired it up (the Android font-family crash noted above
        // surfaced as "should only contain lowercase alphanumeric characters"),
        // so it goes to the log rather than to the member.
        // eslint-disable-next-line no-console
        console.error('initPaymentSheet failed:', initError.code, initError.message);
        Alert.alert('Payment error', "We couldn't open the payment form. Please try again.");
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

    // Step 3 — Sanity-check what the wallet actually confirmed. Both wallet
    // branches above only bail on an explicit error, but a PaymentIntent can
    // come back error-free in a state that isn't money taken (RequiresAction,
    // RequiresPaymentMethod...). Treating those as a sale would show the buyer
    // a confirmed order they never paid for. `Processing` IS a real payment —
    // it just hasn't settled yet — so it passes, and the order screen shows its
    // true status from the row. A null status is the card path, where
    // presentPaymentSheet resolves only once the payment is complete.
    if (
      intentStatus !== null &&
      intentStatus !== PaymentIntent.Status.Succeeded &&
      intentStatus !== PaymentIntent.Status.Processing
    ) {
      setPlacing(false);
      Alert.alert('Payment not completed', "This payment didn't go through. Please try again.");
      return;
    }

    // Step 4 — Payment succeeded. Nothing to write: the order row already
    // exists (create-payment-intent inserted it as the 'pending' reservation
    // that locked the listing), and stripe-webhook owns the rest — flipping it
    // to 'paid', setting the payment id, and marking the listing sold. All this
    // screen has to do is refresh the caches that a purchase invalidates and
    // hand the buyer over to their order.
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.myListings.all });
    // Sold listing should drop out of Suggested / New arrivals on home.
    queryClient.invalidateQueries({ queryKey: queryKeys.home.all });

    setPlacing(false);
    // Fall back to the local estimate only if the edge function's amounts are
    // missing — a receipt with no total would be worse than a recalculated one.
    setPaid({
      orderId: order_id,
      totalPaid: typeof amount === 'number' ? amount / 100 : total,
      protectionFee: typeof protection_fee === 'number' ? protection_fee / 100 : protectionFee,
      paidWith,
      processing: intentStatus === PaymentIntent.Status.Processing,
    });
  };

  // Once payment is through, the checkout form is gone for good. Swallow the
  // Android hardware back press so nobody lands back on a form for an item
  // they've already bought — the two on-screen actions are the only way out.
  useEffect(() => {
    if (!paid) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [paid]);

  if (paid) {
    return (
      <ScreenWrapper>
        <PaymentSuccessView
          orderId={paid.orderId}
          itemTitle={listing?.title ?? 'Your order'}
          imageUrl={listing?.images?.[0] ? getImageUrl(listing.images[0], 'thumbnail') : null}
          sellerUsername={listing?.seller?.username ?? null}
          protectionFee={paid.protectionFee}
          totalPaid={paid.totalPaid}
          paidWith={paid.paidWith}
          processing={paid.processing}
          onViewOrder={() => router.replace(`/order/${paid.orderId}?fromCheckout=true`)}
          onKeepShopping={() => router.replace('/(tabs)')}
        />
      </ScreenWrapper>
    );
  }

  const hasAddress = !!address?.address_line1;
  const addressLine2 = address?.address_line2 ? `, ${address.address_line2}` : '';
  const addressOneLine = hasAddress
    ? `${address?.address_line1}${addressLine2}, ${address?.city}, ${address?.postcode}`
    : null;

  return (
    <ScreenWrapper>
      <Header title="Checkout" showBack />
      <QueryStateView
        query={listingQuery}
        isEmpty={!listing}
        empty={{ heading: 'Listing not found', subtext: 'This listing is no longer available.' }}
      >
        {listing && (
          <>
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
            {paymentOptions.map(option => {
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
                    {option.key === 'google_pay' ? (
                      // Official Google Pay mark already contains the "G Pay"
                      // lockup, so we don't add a duplicate text label next to it.
                      <SvgXml xml={GOOGLE_PAY_MARK} width={53} height={36} />
                    ) : option.key === 'apple_pay' ? (
                      // Official Apple Pay mark already contains the "Apple Pay"
                      // lockup, so we don't add a duplicate text label next to it.
                      <SvgXml xml={APPLE_PAY_MARK} width={34} height={22} />
                    ) : (
                      <>
                        <Ionicons
                          name={option.icon}
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
                      </>
                    )}
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
          label="Buy Now"
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
            <Text style={[styles.breakdownLabel, { ...FontFamily.semibold }]}>Total Including Safe Checkout</Text>
            <Text style={[styles.breakdownValue, { ...FontFamily.semibold }]}>£{total.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.breakdownNote}>
          Every purchase on Dukanoh includes Safe Checkout. If your piece does not arrive or does not match the listing, raise a dispute and our team will step in.
        </Text>
      </BottomSheet>
          </>
        )}
      </QueryStateView>
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
