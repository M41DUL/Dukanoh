import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  Linking,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { QueryStateView } from '@/components/QueryStateView';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { formatGBP } from '@/lib/paymentHelpers';
import { getOrderActions } from '@/lib/orderHelpers';
import {
  useMarkOrderShipped,
  useConfirmOrderReceipt,
  useWithdrawDispute,
  useCancelOrder,
} from '@/lib/mutations';

type OrderStatus = 'created' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'resolved' | 'cancelled';

interface Order {
  id: string;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  status: OrderStatus;
  item_price: number;
  protection_fee: number;
  total_paid: number;
  tracking_number: string | null;
  courier: string | null;
  dispute_reason: string | null;
  dispute_description: string | null;
  disputed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_postcode: string | null;
  delivery_country: string | null;
  dispatch_deadline_at: string | null;
  auto_release_at: string | null;
  resolution_outcome: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  appeal_deadline_at: string | null;
  appealed_at: string | null;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string; avatar_url: string | null } | null;
  seller: { username: string; avatar_url: string | null; is_verified: boolean } | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function relativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 2) return `${days} days`;
  if (days === 1) return 'tomorrow';
  if (hrs  >= 2) return `${hrs} hours`;
  if (hrs  === 1) return '1 hour';
  if (mins > 0) return `${mins} min`;
  return 'soon';
}

interface CourierOption {
  label: string;
  trackingUrl: (n: string) => string;
}

// Top 4 UK couriers covering the long tail of resale shipments. "Other" is a
// free-text fallback so anything else (Parcelforce, FedEx, etc.) still works.
const COURIERS: CourierOption[] = [
  { label: 'Royal Mail', trackingUrl: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}` },
  { label: 'Evri',       trackingUrl: (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}` },
  { label: 'DPD',        trackingUrl: (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}` },
  { label: 'Yodel',      trackingUrl: (n) => `https://www.yodel.co.uk/tracking/${encodeURIComponent(n)}` },
];

function getCourierTrackingUrl(courier: string | null, trackingNumber: string): string | null {
  if (!courier) return null;
  const match = COURIERS.find((c) => c.label.toLowerCase() === courier.toLowerCase());
  return match ? match.trackingUrl(trackingNumber) : null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  created:   'Order placed',
  paid:      'Payment received',
  shipped:   'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed:  'Disputed',
  resolved:  'Resolved',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  created:   '#F59E0B',
  paid:      '#3735C5',
  shipped:   '#3735C5',
  delivered: '#22C55E',
  completed: '#22C55E',
  disputed:  '#FF4444',
  resolved:  '#22C55E',
  cancelled: '#9B9B9B',
};

export default function OrderDetailScreen() {
  const { id, fromCheckout } = useLocalSearchParams<{ id: string; fromCheckout?: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const isFromCheckout = fromCheckout === 'true';

  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  // When the seller picks "Other" we surface a freeform text input. We can't
  // infer this from `courier` alone, since an empty courier is also the default
  // pre-selection state.
  const [otherCourier, setOtherCourier] = useState(false);

  const markShipped = useMarkOrderShipped();
  const confirmReceipt = useConfirmOrderReceipt();
  const withdrawDispute = useWithdrawDispute();
  const cancelOrder = useCancelOrder();

  const orderQuery = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          listing:listings(title, images),
          buyer:users!orders_buyer_id_fkey(username, avatar_url),
          seller:users!orders_seller_id_fkey(username, avatar_url, is_verified)
        `)
        .eq('id', id!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as Order | null;
    },
    enabled: !!id && !!user,
  });

  useRefreshOnFocus(orderQuery.refetch);

  const order = orderQuery.data ?? null;

  // Seed the tracking inputs from server-side values whenever they change
  // (initial load + after a successful mark-shipped refetch).
  useEffect(() => {
    if (!order) return;
    setTrackingNumber(order.tracking_number ?? '');
    setCourier(order.courier ?? '');
    // If a saved courier isn't one of our known chips, surface the "Other" input.
    const saved = (order.courier ?? '').toLowerCase();
    setOtherCourier(saved.length > 0 && !COURIERS.some((c) => c.label.toLowerCase() === saved));
  }, [order?.tracking_number, order?.courier]);

  // ── Buyer/Seller: copy tracking number ───────────────────────
  const handleCopyTracking = async () => {
    if (!order?.tracking_number) return;
    await Clipboard.setStringAsync(order.tracking_number);
    Haptics.selectionAsync();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // ── Buyer/Seller: open courier's tracking page ───────────────
  const handleOpenTracking = () => {
    if (!order?.tracking_number) return;
    const url = getCourierTrackingUrl(order.courier, order.tracking_number);
    if (url) Linking.openURL(url);
  };

  const isBuyer = order?.buyer_id === user?.id;
  const isSeller = order?.seller_id === user?.id;

  // ── Seller: mark as shipped ──────────────────────────────────
  const handleMarkShipped = async () => {
    if (!order || !user) return;
    if (!trackingNumber.trim()) {
      Alert.alert('Tracking number required', 'Please enter a tracking number before marking as shipped.');
      return;
    }
    setSubmitting(true);
    try {
      await markShipped.mutateAsync({
        orderId: order.id,
        sellerId: user.id,
        trackingNumber: trackingNumber.trim(),
        courier: courier.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not update order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Buyer: confirm receipt ───────────────────────────────────
  const handleConfirmReceipt = async () => {
    if (!order) return;
    Alert.alert(
      'Confirm receipt',
      'Tapping confirm starts a 48-hour window before payment is released to the seller. You can still raise a dispute during that window.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            if (!user) return;
            setSubmitting(true);
            try {
              await confirmReceipt.mutateAsync({
                orderId: order.id,
                buyerId: user.id,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // ── Seller: copy delivery address ────────────────────────────
  const [addressCopied, setAddressCopied] = useState(false);
  const handleCopyAddress = async () => {
    if (!order?.delivery_address_line1) return;
    const lines = [
      order.delivery_address_line1,
      order.delivery_address_line2,
      order.delivery_city,
      order.delivery_postcode,
      order.delivery_country,
    ].filter(Boolean).join('\n');
    await Clipboard.setStringAsync(lines);
    Haptics.selectionAsync();
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 1800);
  };

  // ── Cancel order ─────────────────────────────────────────────
  const handleCancel = async () => {
    if (!order) return;
    Alert.alert(
      'Cancel order',
      `Are you sure you want to cancel? You'll be refunded £${order.item_price.toFixed(2)} to your original payment method. The Dukanoh Safe Checkout charge is non-refundable.`,
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setSubmitting(true);
            try {
              await cancelOrder.mutateAsync(
                isBuyer
                  ? { orderId: order.id, listingId: order.listing_id, cancelledBy: 'buyer' }
                  : { orderId: order.id, listingId: order.listing_id, cancelledBy: 'seller', sellerId: user.id },
              );
            } catch (err) {
              const message =
                err instanceof Error && err.message
                  ? err.message
                  : 'Could not process refund. Please contact support.';
              Alert.alert('Cancellation failed', message);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // ── Buyer: withdraw dispute ──────────────────────────────────
  const handleWithdrawDispute = () => {
    Alert.alert(
      'Withdraw dispute',
      'This will release payment to the seller and mark the order as complete. Only do this if your issue has been resolved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw & complete',
          onPress: async () => {
            if (!user || !order) return;
            setSubmitting(true);
            try {
              await withdrawDispute.mutateAsync({
                orderId: order.id,
                buyerId: user.id,
              });
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // ── Message counterpart ──────────────────────────────────────
  const handleMessage = async () => {
    if (!order) return;
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', order.listing_id ?? '')
      .maybeSingle();
    if (data?.id) {
      router.push(`/conversation/${data.id}`);
    } else {
      router.push('/(tabs)/inbox');
    }
  };

  // ── Need help action sheet ───────────────────────────────────
  // Messaging the counterpart isn't included here; the sticky bar always exposes
  // it (either as the fallback primary button or as a chat icon), so listing it
  // again would be a duplicate.
  const handleNeedHelp = () => {
    if (!order) return;
    const { canCancel, canDispute, canWithdrawDispute } = getOrderActions(order.status, isBuyer, isSeller);

    const optionLabels: string[] = [];
    const optionActions: (() => void)[] = [];

    if (canCancel) {
      optionLabels.push('Cancel order');
      optionActions.push(handleCancel);
    }

    if (canDispute && isBuyer) {
      optionLabels.push('Raise a dispute');
      optionActions.push(() => router.push(`/order/${order.id}/dispute`));
    }

    if (canWithdrawDispute) {
      optionLabels.push('Withdraw dispute');
      optionActions.push(handleWithdrawDispute);
    }

    optionLabels.push('Contact support');
    optionActions.push(() => Linking.openURL(`mailto:support@dukanoh.com?subject=Order ${order.id}`));

    if (Platform.OS === 'ios') {
      const cancelIndex = optionLabels.length;
      const destructiveIndex = optionLabels.indexOf('Cancel order');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...optionLabels, 'Cancel'],
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (buttonIndex) => {
          if (buttonIndex < optionActions.length) {
            optionActions[buttonIndex]();
          }
        },
      );
    } else {
      Alert.alert(
        'Need help?',
        undefined,
        [
          ...optionLabels.map((label, i) => ({
            text: label,
            style: label === 'Cancel order' ? ('destructive' as const) : ('default' as const),
            onPress: optionActions[i],
          })),
          { text: 'Dismiss', style: 'cancel' as const },
        ],
      );
    }
  };

  const statusColor = order ? STATUS_COLOR[order.status] ?? colors.textSecondary : colors.textSecondary;
  const orderActions = order
    ? getOrderActions(order.status, isBuyer, isSeller)
    : { canShip: false, canConfirm: false, isDisputed: false };
  const { canShip, canConfirm, isDisputed } = orderActions;

  const imageUrl = order?.listing?.images?.[0]
    ? getImageUrl(order.listing.images[0], 'detail')
    : null;

  // Single source of truth for the "deadline chip" that sits next to the status.
  // Whichever deadline applies to the current state gets surfaced once, prominently,
  // instead of being buried in a small amber strip mid-scroll.
  const countdown: { label: string } | null = (() => {
    if (!order) return null;
    if (canShip && order.dispatch_deadline_at) {
      return { label: `Dispatch in ${relativeTime(order.dispatch_deadline_at)}` };
    }
    if (order.status === 'paid' && isBuyer && order.dispatch_deadline_at) {
      return { label: `Ships in ${relativeTime(order.dispatch_deadline_at)}` };
    }
    if ((order.status === 'shipped' || order.status === 'delivered') && order.auto_release_at) {
      return { label: `Releases in ${relativeTime(order.auto_release_at)}` };
    }
    if (
      order.status === 'resolved' &&
      !order.appealed_at &&
      order.appeal_deadline_at &&
      new Date(order.appeal_deadline_at) > new Date()
    ) {
      return { label: `Appeal in ${relativeTime(order.appeal_deadline_at)}` };
    }
    return null;
  })();

  // The buyer's "Item received" CTA is the only positive primary action that does
  // not require an inline form, so it is the one that gets promoted to the sticky bar.
  const primaryAction: { label: string; onPress: () => void } | null =
    order && canConfirm
      ? { label: 'Item received', onPress: handleConfirmReceipt }
      : null;

  const orderRef = order ? order.id.slice(0, 8).toUpperCase() : '';

  return (
    <ScreenWrapper>
      <Header title={order ? 'Order details' : 'Order'} showBack />

      <QueryStateView
        query={orderQuery}
        isEmpty={!order}
        empty={{ heading: 'Order not found.' }}
      >
      {order && (
      <View style={styles.inner}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: isFromCheckout ? insets.bottom + Spacing['2xl'] : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Order header card ───────────────────────────────── */}
          <View style={[styles.headerCard, { backgroundColor: colors.surface }]}>
            <View style={styles.headerRow}>
              <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceAlt }]}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumb} />
                )}
              </View>
              <View style={styles.headerInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {order.listing?.title ?? 'Listing removed'}
                </Text>
                <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                  {formatGBP(order.item_price)}
                </Text>
              </View>
            </View>

            <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />

            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}1F` }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {STATUS_LABEL[order.status]}
                </Text>
              </View>
              {countdown && (
                <View style={[styles.countdownChip, { borderColor: colors.amber + '55', backgroundColor: colors.amber + '14' }]}>
                  <Ionicons name="time-outline" size={12} color={colors.amber} />
                  <Text style={[styles.countdownText, { color: colors.amber }]}>{countdown.label}</Text>
                </View>
              )}
            </View>

            {orderRef ? (
              <Text style={[styles.orderRef, { color: colors.textSecondary }]}>Order #{orderRef}</Text>
            ) : null}
          </View>

          {/* Tracking */}
          {order.status !== 'created' && order.status !== 'paid' && order.tracking_number && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.trackingHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tracking</Text>
                  {order.courier ? (
                    <Text style={[styles.trackingCourier, { color: colors.textPrimary }]}>
                      {order.courier}
                    </Text>
                  ) : null}
                </View>
                {getCourierTrackingUrl(order.courier, order.tracking_number) && (
                  <TouchableOpacity
                    style={[styles.trackingAction, { borderColor: colors.border }]}
                    onPress={handleOpenTracking}
                    hitSlop={4}
                  >
                    <Ionicons name="open-outline" size={14} color={colors.textPrimary} />
                    <Text style={[styles.trackingActionText, { color: colors.textPrimary }]}>Track</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.trackingNumberRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                onPress={handleCopyTracking}
                activeOpacity={0.7}
                accessibilityLabel="Copy tracking number"
              >
                <Text
                  style={[styles.trackingNumberText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {order.tracking_number}
                </Text>
                <View style={styles.trackingCopy}>
                  <Ionicons
                    name={copied ? 'checkmark' : 'copy-outline'}
                    size={14}
                    color={copied ? colors.success : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.trackingCopyText,
                      { color: copied ? colors.success : colors.textSecondary },
                    ]}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Visual stepper */}
              <TrackingStepper order={order} colors={colors} />
            </View>
          )}

          {/* Order details */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Details</Text>
            <MetaRow icon="calendar-outline" label="Order date" value={formatDate(order.created_at)} colors={colors} />
            <PersonRow
              icon="person-outline"
              label={isBuyer ? 'Seller' : 'Buyer'}
              username={isBuyer ? order.seller?.username : order.buyer?.username}
              avatarUrl={isBuyer ? order.seller?.avatar_url : order.buyer?.avatar_url}
              colors={colors}
            />
            <MetaRow icon="pricetag-outline" label="Item price" value={formatGBP(order.item_price)} colors={colors} />
            <MetaRow icon="shield-checkmark-outline" label="Dukanoh Safe Checkout" value={formatGBP(order.protection_fee)} colors={colors} />
            <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
            <MetaRow icon="cash-outline" label="Total paid" value={formatGBP(order.total_paid)} bold colors={colors} />
            {order.status === 'completed' && (
              <MetaRow
                icon="checkmark-circle-outline"
                label="Released by"
                value={order.delivered_at ? 'Buyer confirmed receipt' : 'Auto-released after 7 days'}
                colors={colors}
              />
            )}
          </View>

          {/* ── BUYER: waiting for seller to ship ─────────────────── */}
          {order.status === 'paid' && isBuyer && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.waitingRow}>
                <View style={[styles.waitingIcon, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="cube-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.waitingTitle, { color: colors.textPrimary }]}>
                    Waiting for seller to ship
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {order.dispatch_deadline_at
                      ? `Ships in ${relativeTime(order.dispatch_deadline_at)} (by ${formatDate(order.dispatch_deadline_at)}). If the seller misses this, the order is cancelled and you're refunded automatically.`
                      : "We'll notify you the moment your item is on its way."}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── SELLER: unverified nudge ─────────────────────────── */}
          {canShip && !order.seller?.is_verified && (
            <TouchableOpacity
              style={[styles.nudgeCard, { backgroundColor: colors.amber + '15', borderColor: colors.amber + '35' }]}
              onPress={() => router.push('/stripe-onboarding')}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.amber} />
              <View style={styles.nudgeText}>
                <Text style={[styles.nudgeTitle, { color: colors.textPrimary }]}>
                  Complete Dukanoh Verify to receive payment
                </Text>
                <Text style={[styles.nudgeSub, { color: colors.textSecondary }]}>
                  Funds won't reach you until your account is verified.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* ── SELLER: ship to address ──────────────────────────── */}
          {canShip && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.trackingHeader}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary, flex: 1 }]}>Ship to</Text>
                {order.delivery_address_line1 && (
                  <TouchableOpacity
                    style={[styles.trackingAction, { borderColor: colors.border }]}
                    onPress={handleCopyAddress}
                    hitSlop={4}
                    accessibilityLabel="Copy address"
                  >
                    <Ionicons
                      name={addressCopied ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={addressCopied ? colors.success : colors.textPrimary}
                    />
                    <Text
                      style={[
                        styles.trackingActionText,
                        { color: addressCopied ? colors.success : colors.textPrimary },
                      ]}
                    >
                      {addressCopied ? 'Copied' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {order.delivery_address_line1 ? (
                <Text style={[styles.addressText, { color: colors.textPrimary }]}>
                  {[
                    order.delivery_address_line1,
                    order.delivery_address_line2,
                    order.delivery_city,
                    order.delivery_postcode,
                    order.delivery_country,
                  ].filter(Boolean).join('\n')}
                </Text>
              ) : (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  No delivery address was saved at checkout.
                </Text>
              )}
            </View>
          )}

          {/* ── SELLER: mark shipped form ────────────────────────── */}
          {canShip && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Ship this order</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Enter tracking details and mark as shipped. Payment releases 48 hours after the buyer confirms receipt, or automatically 7 days after delivery if they take no action.
              </Text>
              {order.dispatch_deadline_at && (
                <View style={[styles.autoRelease, { backgroundColor: colors.amber + '15', borderColor: colors.amber + '35' }]}>
                  <Ionicons name="time-outline" size={14} color={colors.amber} />
                  <Text style={[styles.autoReleaseText, { color: colors.amber }]}>
                    Dispatch in {relativeTime(order.dispatch_deadline_at)} (by {formatDate(order.dispatch_deadline_at)}). Miss this deadline and the order will be automatically cancelled and the buyer refunded.
                  </Text>
                </View>
              )}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                  Tracking number <Text style={{ color: colors.error }}>*</Text>
                </Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.textInput, { color: colors.textPrimary }]}
                    placeholder="e.g. AB123456789GB"
                    placeholderTextColor={colors.textSecondary}
                    value={trackingNumber}
                    onChangeText={setTrackingNumber}
                    underlineColorAndroid="transparent"
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Courier</Text>
                <View style={styles.chipRow}>
                  {COURIERS.map((c) => {
                    const selected = !otherCourier && courier.toLowerCase() === c.label.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={c.label}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? colors.primary : colors.surfaceAlt,
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setCourier(c.label);
                          setOtherCourier(false);
                          Haptics.selectionAsync();
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.textPrimary }]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      {
                        backgroundColor: otherCourier ? colors.primary : colors.surfaceAlt,
                        borderColor: otherCourier ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setOtherCourier(true);
                      // Clear if currently set to a known chip so the input starts fresh.
                      if (COURIERS.some((c) => c.label.toLowerCase() === courier.toLowerCase())) {
                        setCourier('');
                      }
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { color: otherCourier ? '#FFFFFF' : colors.textPrimary }]}>
                      Other
                    </Text>
                  </TouchableOpacity>
                </View>
                {otherCourier && (
                  <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, marginTop: Spacing.sm }]}>
                    <TextInput
                      style={[styles.textInput, { color: colors.textPrimary }]}
                      placeholder="Courier name"
                      placeholderTextColor={colors.textSecondary}
                      value={courier}
                      onChangeText={setCourier}
                      underlineColorAndroid="transparent"
                      autoCapitalize="words"
                    />
                  </View>
                )}
              </View>

              <Button label="Mark as shipped" onPress={handleMarkShipped} loading={submitting} />
            </View>
          )}

          {/* ── BUYER: confirm receipt ───────────────────────────── */}
          {canConfirm && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Has your item arrived?</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Tap "Item received" below to start the 48-hour release window. If something isn't right, report an issue instead and payment stays on hold.
              </Text>
              <Button
                label="Report an issue"
                variant="outline"
                onPress={() => router.push(`/order/${order.id}/dispute`)}
              />
            </View>
          )}

          {/* ── BUYER: delivered, dispute window active ─────────── */}
          {order.status === 'delivered' && isBuyer && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Receipt confirmed</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {order.auto_release_at
                  ? `Payment releases in ${relativeTime(order.auto_release_at)} (on ${formatDate(order.auto_release_at)}). Raise a dispute before then if something is wrong.`
                  : 'Payment will release shortly. Raise a dispute now if something is wrong.'}
              </Text>
              <Button
                label="Report an issue"
                variant="outline"
                onPress={() => router.push(`/order/${order.id}/dispute`)}
                style={{ marginTop: 8 }}
              />
            </View>
          )}

          {/* ── DISPUTE card ─────────────────────────────────────── */}
          {isDisputed && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.disputeHeader}>
                <View style={[styles.disputeIcon, { backgroundColor: `${colors.error}15` }]}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Dispute filed</Text>
                  {order.disputed_at && (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>{formatDate(order.disputed_at)}</Text>
                  )}
                </View>
              </View>
              {order.dispute_reason && (
                <View style={[styles.reasonPill, { backgroundColor: `${colors.error}12` }]}>
                  <Text style={[styles.reasonText, { color: colors.error }]}>{order.dispute_reason}</Text>
                </View>
              )}
              {order.dispute_description && (
                <Text style={[styles.hint, { color: colors.textPrimary }]}>{order.dispute_description}</Text>
              )}
              <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Our team reviews all disputes and will be in touch within 7 days.
              </Text>
            </View>
          )}

          {/* ── RESOLVED card ────────────────────────────────────── */}
          {order.status === 'resolved' && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.disputeHeader}>
                <View style={[styles.disputeIcon, { backgroundColor: '#22C55E15' }]}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Dispute resolved</Text>
                  {order.resolved_at && (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>{formatDate(order.resolved_at)}</Text>
                  )}
                </View>
              </View>
              <View style={[styles.reasonPill, {
                backgroundColor: order.resolution_outcome === 'release_seller' ? colors.success + '1F' : `${colors.error}12`,
              }]}>
                <Text style={[styles.reasonText, {
                  color: order.resolution_outcome === 'release_seller' ? colors.success : colors.error,
                }]}>
                  {order.resolution_outcome === 'release_seller'
                    ? 'Item matched the listing, payment released to seller'
                    : 'Refund issued to buyer'}
                </Text>
              </View>
              {order.resolution_note && (
                <Text style={[styles.hint, { color: colors.textPrimary }]}>{order.resolution_note}</Text>
              )}
              <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
              {order.appealed_at ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Appeal submitted. Our team will respond within 7 days.
                </Text>
              ) : order.appeal_deadline_at && new Date(order.appeal_deadline_at) > new Date() ? (
                <>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    You can appeal this decision for the next {relativeTime(order.appeal_deadline_at)} (until {formatDate(order.appeal_deadline_at)}).
                  </Text>
                  <Button
                    label="Appeal this decision"
                    variant="outline"
                    onPress={() => router.push(`/order/${order.id}/appeal`)}
                    style={{ marginTop: 4 }}
                  />
                </>
              ) : (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Appeal window closed.
                </Text>
              )}
            </View>
          )}

          {/* ── From checkout: explicit exit so the user isn't stranded ─── */}
          {isFromCheckout && (
            <View style={styles.checkoutExit}>
              <Button label="View all orders" onPress={() => router.replace('/orders')} />
              <Button
                label="Back to home"
                variant="outline"
                onPress={() => router.replace('/(tabs)')}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          )}
        </ScrollView>

        {/* ── Sticky bottom bar ─────────────────────────────────── */}
        {!isFromCheckout && (
          <View style={[styles.stickyBar, {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Spacing.sm,
          }]}>
            <View style={styles.stickyRow}>
              <View style={{ flex: 1 }}>
                {primaryAction ? (
                  <Button
                    label={primaryAction.label}
                    onPress={primaryAction.onPress}
                    loading={submitting}
                  />
                ) : (
                  <Button
                    label={isBuyer ? 'Message seller' : 'Message buyer'}
                    variant="outline"
                    onPress={handleMessage}
                  />
                )}
              </View>
              {primaryAction && (
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.surface }]}
                  onPress={handleMessage}
                  hitSlop={6}
                  accessibilityLabel={isBuyer ? 'Message seller' : 'Message buyer'}
                >
                  <Ionicons name="chatbubble-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: colors.surface }]}
                onPress={handleNeedHelp}
                hitSlop={6}
                accessibilityLabel="Need help with this order"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      )}
      </QueryStateView>
    </ScreenWrapper>
  );
}

function MetaRow({
  icon,
  label,
  value,
  bold,
  colors,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  bold?: boolean;
  colors: ColorTokens;
}) {
  return (
    <View style={metaStyles.row}>
      <View style={metaStyles.labelGroup}>
        {icon ? <Ionicons name={icon} size={14} color={colors.textSecondary} /> : null}
        <Text style={[metaStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[metaStyles.value, { color: colors.textPrimary, ...(bold ? FontFamily.bold : FontFamily.medium) }]}>
        {value}
      </Text>
    </View>
  );
}

function PersonRow({
  icon,
  label,
  username,
  avatarUrl,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  username: string | undefined;
  avatarUrl: string | null | undefined;
  colors: ColorTokens;
}) {
  const initials = (username ?? '?').slice(0, 1).toUpperCase();
  return (
    <View style={metaStyles.row}>
      <View style={metaStyles.labelGroup}>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
        <Text style={[metaStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={metaStyles.personValue}>
        <Avatar uri={avatarUrl ?? undefined} initials={initials} size="small" />
        <Text style={[metaStyles.value, { color: colors.textPrimary, ...FontFamily.medium }]}>
          @{username ?? 'unknown'}
        </Text>
      </View>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 20 },
  labelGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, ...FontFamily.regular },
  value: { fontSize: 13 },
  personValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});

function TrackingStepper({ order, colors }: { order: Order; colors: ColorTokens }) {
  // Maps the parcel-journey UI to underlying order state. "In transit" is implied
  // between shipped and delivered since we don't ingest courier-level events.
  const delivered = !!order.delivered_at || order.status === 'completed';
  const completed = order.status === 'completed';
  const steps = [
    { label: 'Shipped',    reached: !!order.shipped_at },
    { label: 'In transit', reached: delivered },
    { label: 'Delivered',  reached: delivered },
    { label: 'Released',   reached: completed },
  ];
  // Active = first non-reached step (the one currently in progress).
  const activeIdx = steps.findIndex((s) => !s.reached);

  return (
    <View style={stepperStyles.row}>
      {steps.map((s, i) => {
        const reached = s.reached;
        const isActive = i === activeIdx;
        const dotColor = reached ? colors.primary : isActive ? colors.primary : colors.border;
        const innerFill = reached ? colors.primary : isActive ? colors.background : 'transparent';
        return (
          <React.Fragment key={s.label}>
            <View style={stepperStyles.col}>
              <View style={[stepperStyles.dot, { borderColor: dotColor, backgroundColor: reached ? colors.primary : colors.background }]}>
                {reached ? (
                  <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                ) : isActive ? (
                  <View style={[stepperStyles.inner, { backgroundColor: innerFill === 'transparent' ? colors.primary : colors.primary }]} />
                ) : null}
              </View>
              <Text style={[stepperStyles.label, { color: reached || isActive ? colors.textPrimary : colors.textSecondary }]}>
                {s.label}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[stepperStyles.connector, { backgroundColor: steps[i + 1].reached || reached ? colors.primary : colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.xs,
  },
  col: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    ...FontFamily.medium,
    textAlign: 'center',
  },
  connector: {
    flex: 1,
    height: 2,
    marginTop: 7,
  },
});

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    inner: { flex: 1 },
    scroll: {
      paddingTop: Spacing.base,
      gap: Spacing.base,
    },
    headerCard: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      gap: Spacing.base,
      alignItems: 'flex-start',
    },
    thumbWrap: {
      width: 72,
      height: 90,
      borderRadius: BorderRadius.medium,
      overflow: 'hidden',
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    headerInfo: {
      flex: 1,
      gap: Spacing.xs,
      justifyContent: 'center',
    },
    itemTitle: {
      fontSize: 15,
      ...FontFamily.medium,
      lineHeight: 20,
    },
    itemPrice: {
      fontSize: 20,
      ...FontFamily.bold,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 14,
      ...FontFamily.semibold,
    },
    countdownChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    countdownText: {
      fontSize: 12,
      ...FontFamily.semibold,
    },
    orderRef: {
      fontSize: 11,
      ...FontFamily.medium,
      letterSpacing: 0.4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
    },
    trackingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    trackingCourier: {
      fontSize: 16,
      ...FontFamily.semibold,
      marginTop: 4,
    },
    trackingAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.md,
      height: 32,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    trackingActionText: {
      fontSize: 12,
      ...FontFamily.semibold,
    },
    trackingNumberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      height: 44,
      borderRadius: BorderRadius.medium,
      borderWidth: 1,
    },
    trackingNumberText: {
      flex: 1,
      fontSize: 14,
      ...FontFamily.medium,
      letterSpacing: 0.3,
    },
    trackingCopy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    trackingCopyText: {
      fontSize: 12,
      ...FontFamily.semibold,
    },
    section: {
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      ...FontFamily.semibold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    metaDivider: {
      height: StyleSheet.hairlineWidth,
    },
    card: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    nudgeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderRadius: BorderRadius.large,
      borderWidth: 1,
      padding: Spacing.base,
    },
    waitingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
    },
    waitingIcon: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    waitingTitle: {
      fontSize: 14,
      ...FontFamily.semibold,
    },
    nudgeText: { flex: 1, gap: 2 },
    nudgeTitle: { fontSize: 13, ...FontFamily.semibold },
    nudgeSub: { fontSize: 12, ...FontFamily.regular, lineHeight: 17 },
    hint: {
      fontSize: 13,
      ...FontFamily.regular,
      lineHeight: 18,
    },
    addressText: {
      fontSize: 14,
      ...FontFamily.regular,
      lineHeight: 22,
    },
    inputWrap: {
      borderRadius: BorderRadius.medium,
      borderWidth: 1.5,
      paddingHorizontal: Spacing.base,
      height: 52,
      justifyContent: 'center',
    },
    textInput: {
      fontSize: 14,
      ...FontFamily.regular,
    },
    fieldGroup: {
      gap: Spacing.xs,
    },
    fieldLabel: {
      fontSize: 13,
      ...FontFamily.semibold,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    chip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    chipText: {
      fontSize: 13,
      ...FontFamily.semibold,
    },
    autoRelease: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    autoReleaseText: {
      flex: 1,
      fontSize: 12,
      ...FontFamily.regular,
      lineHeight: 17,
    },
    disputeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    disputeIcon: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    reasonPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    reasonText: {
      fontSize: 12,
      ...FontFamily.semibold,
    },
    stickyBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: Spacing.base,
      paddingHorizontal: Spacing.base,
    },
    stickyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkoutExit: {
      marginTop: Spacing.base,
    },
  });
}
