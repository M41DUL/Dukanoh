import React, { useState, useCallback, useMemo } from 'react';
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
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatGBP } from '@/lib/paymentHelpers';
import { getOrderActions } from '@/lib/orderHelpers';
import { edgeFetch } from '@/lib/edgeFetch';

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

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        listing:listings(title, images),
        buyer:users!orders_buyer_id_fkey(username, avatar_url),
        seller:users!orders_seller_id_fkey(username, avatar_url, is_verified)
      `)
      .eq('id', id)
      .single();

    if (data) {
      setOrder(data as Order);
      setTrackingNumber(data.tracking_number ?? '');
      setCourier(data.courier ?? '');
    }
    setLoading(false);
  }, [id, user]);

  useFocusEffect(useCallback(() => { fetchOrder(); }, [fetchOrder]));

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
    const { error } = await supabase.rpc('mark_order_shipped', {
      p_order_id:  order.id,
      p_seller_id: user.id,
      p_tracking:  trackingNumber.trim(),
      p_courier:   courier.trim() || null,
    });
    if (error) {
      setSubmitting(false);
      Alert.alert('Error', 'Could not update order. Please try again.');
    } else {
      await fetchOrder();
      setSubmitting(false);
    }
  };

  // ── Buyer: confirm receipt ───────────────────────────────────
  const handleConfirmReceipt = async () => {
    if (!order) return;
    Alert.alert(
      'Confirm receipt',
      'Confirming receipt starts a 48-hour window before payment is released to the seller. You can still raise a dispute during that window.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            if (!user) return;
            setSubmitting(true);
            await supabase.rpc('confirm_order_receipt', {
              p_order_id: order.id,
              p_buyer_id: user.id,
            });
            await fetchOrder();
            setSubmitting(false);
          },
        },
      ]
    );
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
            setSubmitting(true);
            const refundRes = await edgeFetch('stripe-refund', { order_id: order.id });
            if (!refundRes.ok) {
              const err = await refundRes.json().catch(() => ({}));
              setSubmitting(false);
              Alert.alert('Cancellation failed', err?.error ?? 'Could not process refund. Please contact support.');
              return;
            }
            const cancelledBy = isBuyer ? 'buyer' : 'seller';
            await supabase.from('orders').update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: cancelledBy,
            }).eq('id', order.id);
            if (order.listing_id) {
              await supabase.from('listings').update({ status: 'available', buyer_id: null, sold_at: null }).eq('id', order.listing_id);
            }
            if (isSeller && user) {
              await supabase.from('cancellation_strikes').insert({ seller_id: user.id, order_id: order.id });
            }
            await fetchOrder();
            setSubmitting(false);
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
            await supabase.from('orders').update({
              status: 'completed',
              delivered_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            }).eq('id', order.id).eq('buyer_id', user.id);
            await fetchOrder();
            setSubmitting(false);
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
  const handleNeedHelp = () => {
    if (!order) return;
    const { canCancel, canDispute, canWithdrawDispute } = getOrderActions(order.status, isBuyer, isSeller);

    const optionLabels: string[] = [];
    const optionActions: (() => void)[] = [];

    optionLabels.push(isBuyer ? 'Message seller' : 'Message buyer');
    optionActions.push(handleMessage);

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

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Order" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (!order) {
    return (
      <ScreenWrapper>
        <Header title="Order" showBack />
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>Order not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  const statusColor = STATUS_COLOR[order.status] ?? colors.textSecondary;
  const { canShip, canConfirm, isDisputed } = getOrderActions(order.status, isBuyer, isSeller);

  const imageUrl = order.listing?.images?.[0]
    ? getImageUrl(order.listing.images[0], 'detail')
    : null;

  return (
    <ScreenWrapper>
      <Header title="Order details" showBack />

      <View style={styles.inner}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: isFromCheckout ? insets.bottom + Spacing['2xl'] : insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Status pill */}
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}15` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABEL[order.status]}
            </Text>
          </View>

          {/* Item image */}
          <View style={[styles.imageWrap, { backgroundColor: colors.surface }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.image, { backgroundColor: colors.surfaceAlt }]} />
            )}
          </View>

          {/* Item title + price */}
          <View style={styles.itemInfo}>
            <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {order.listing?.title ?? 'Listing removed'}
            </Text>
            <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
              {formatGBP(order.item_price)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Order details */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Details</Text>
            <MetaRow label="Order date" value={formatDate(order.created_at)} colors={colors} />
            <MetaRow
              label={isBuyer ? 'Seller' : 'Buyer'}
              value={isBuyer ? `@${order.seller?.username}` : `@${order.buyer?.username}`}
              colors={colors}
            />
            <MetaRow label="Item price" value={formatGBP(order.item_price)} colors={colors} />
            <MetaRow label="Dukanoh Safe Checkout" value={formatGBP(order.protection_fee)} colors={colors} />
            <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
            <MetaRow label="Total paid" value={formatGBP(order.total_paid)} bold colors={colors} />
            {order.status === 'completed' && (
              <MetaRow
                label="Released by"
                value={order.delivered_at ? 'Buyer confirmed receipt' : 'Auto-released after 7 days'}
                colors={colors}
              />
            )}
          </View>

          {/* Tracking */}
          {order.status !== 'created' && order.status !== 'paid' && order.tracking_number && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tracking</Text>
                {order.courier ? <MetaRow label="Courier" value={order.courier} colors={colors} /> : null}
                <MetaRow label="Tracking number" value={order.tracking_number} colors={colors} />
                {order.shipped_at && (
                  <MetaRow label="Shipped on" value={formatDate(order.shipped_at)} colors={colors} />
                )}
              </View>
            </>
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
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Ship to</Text>
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
                Enter tracking details and mark as shipped. Once the buyer confirms receipt, payment is held for 48 hours before being released to you.
              </Text>
              {order.dispatch_deadline_at && (
                <View style={[styles.autoRelease, { backgroundColor: colors.amber + '15', borderColor: colors.amber + '35' }]}>
                  <Ionicons name="time-outline" size={14} color={colors.amber} />
                  <Text style={[styles.autoReleaseText, { color: colors.amber }]}>
                    Dispatch by {formatDate(order.dispatch_deadline_at)}. Miss this deadline and the order will be automatically cancelled and the buyer refunded.
                  </Text>
                </View>
              )}
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder="Tracking number *"
                  placeholderTextColor={colors.textSecondary}
                  value={trackingNumber}
                  onChangeText={setTrackingNumber}
                  underlineColorAndroid="transparent"
                  autoCapitalize="characters"
                />
              </View>
              <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder="Courier (e.g. Royal Mail)"
                  placeholderTextColor={colors.textSecondary}
                  value={courier}
                  onChangeText={setCourier}
                  underlineColorAndroid="transparent"
                  autoCapitalize="words"
                />
              </View>
              <Button label="Mark as shipped" onPress={handleMarkShipped} loading={submitting} />
            </View>
          )}

          {/* ── BUYER: confirm receipt ───────────────────────────── */}
          {canConfirm && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Has your item arrived?</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Confirm receipt to start the 48-hour release window, or report an issue to hold payment.
              </Text>
              {order.auto_release_at && (
                <View style={[styles.autoRelease, { backgroundColor: colors.amber + '15', borderColor: colors.amber + '35' }]}>
                  <Ionicons name="time-outline" size={14} color={colors.amber} />
                  <Text style={[styles.autoReleaseText, { color: colors.amber }]}>
                    Payment releases automatically on {formatDate(order.auto_release_at)} if you take no action
                  </Text>
                </View>
              )}
              <Button label="Item received" onPress={handleConfirmReceipt} loading={submitting} />
              <Button
                label="Report an issue"
                variant="outline"
                onPress={() => router.push(`/order/${order.id}/dispute`)}
                style={{ marginTop: 8 }}
              />
            </View>
          )}

          {/* ── BUYER: delivered — dispute window active ─────────── */}
          {order.status === 'delivered' && isBuyer && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Receipt confirmed</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                Payment is held until {order.auto_release_at ? formatDate(order.auto_release_at) : 'shortly'}. Raise a dispute before then if something is wrong.
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
                backgroundColor: order.resolution_outcome === 'release_seller' ? '#22C55E15' : `${colors.error}12`,
              }]}>
                <Text style={[styles.reasonText, {
                  color: order.resolution_outcome === 'release_seller' ? '#15803D' : colors.error,
                }]}>
                  {order.resolution_outcome === 'release_seller' ? 'Decided in favour of seller' : 'Decided in favour of buyer'}
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
                    You can appeal this decision before {formatDate(order.appeal_deadline_at)}.
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
        </ScrollView>

        {/* ── Sticky bottom bar ─────────────────────────────────── */}
        {!isFromCheckout && (
          <View style={[styles.stickyBar, {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Spacing.sm,
          }]}>
            <Button
              label="Need help with this order?"
              variant="outline"
              onPress={handleNeedHelp}
            />
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}

function MetaRow({ label, value, bold, colors }: { label: string; value: string; bold?: boolean; colors: ColorTokens }) {
  return (
    <View style={metaStyles.row}>
      <Text style={[metaStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: colors.textPrimary, fontFamily: bold ? FontFamily.bold : FontFamily.medium }]}>
        {value}
      </Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontFamily: FontFamily.regular },
  value: { fontSize: 13 },
});

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    inner: { flex: 1 },
    scroll: {
      paddingTop: Spacing.base,
      gap: Spacing.base,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
    },
    imageWrap: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
      marginHorizontal: -Spacing.base,
    },
    image: {
      width: '100%',
      aspectRatio: 4 / 5,
    },
    itemInfo: {
      gap: Spacing.xs,
    },
    itemTitle: {
      fontSize: 16,
      fontFamily: FontFamily.medium,
      lineHeight: 22,
    },
    itemPrice: {
      fontSize: 22,
      fontFamily: FontFamily.bold,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: -Spacing.base,
    },
    section: {
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
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
    nudgeText: { flex: 1, gap: 2 },
    nudgeTitle: { fontSize: 13, fontFamily: FontFamily.semibold },
    nudgeSub: { fontSize: 12, fontFamily: FontFamily.regular, lineHeight: 17 },
    hint: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    addressText: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
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
      fontFamily: FontFamily.regular,
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
      fontFamily: FontFamily.regular,
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
      fontFamily: FontFamily.semibold,
    },
    stickyBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: Spacing.base,
      paddingHorizontal: Spacing.base,
    },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    notFoundText: { fontSize: 14, fontFamily: FontFamily.regular },
  });
}
