import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
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
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  listing: {
    title: string;
    images: string[];
  } | null;
  buyer: { username: string; avatar_url: string | null } | null;
  seller: { username: string; avatar_url: string | null } | null;
}

function formatGBP(amount: number) {
  return `£${amount.toFixed(2)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  created: 'Order placed',
  paid: 'Payment received',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  created: '#F59E0B',
  paid: '#3735C5',
  shipped: '#3735C5',
  delivered: '#22C55E',
  completed: '#22C55E',
  disputed: '#FF4444',
  resolved: '#22C55E',
  cancelled: '#9B9B9B',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
        seller:users!orders_seller_id_fkey(username, avatar_url)
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
    if (!order) return;
    if (!trackingNumber.trim()) {
      Alert.alert('Tracking number required', 'Please enter a tracking number before marking as shipped.');
      return;
    }
    setSubmitting(true);
    const autoReleaseAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        tracking_number: trackingNumber.trim(),
        courier: courier.trim() || null,
        shipped_at: new Date().toISOString(),
        auto_release_at: autoReleaseAt,
      })
      .eq('id', order.id);
    setSubmitting(false);
    if (error) {
      Alert.alert('Error', 'Could not update order. Please try again.');
    } else {
      fetchOrder();
    }
  };

  // ── Buyer: confirm receipt ───────────────────────────────────
  const handleConfirmReceipt = async () => {
    if (!order) return;
    Alert.alert(
      'Confirm receipt',
      'Confirming receipt will release payment to the seller. Are you sure the item has arrived?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSubmitting(true);
            await supabase
              .from('orders')
              .update({
                status: 'completed',
                delivered_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              })
              .eq('id', order.id);
            setSubmitting(false);
            fetchOrder();
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
      'Are you sure you want to cancel this order? The listing will be returned to available.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            const cancelledBy = isBuyer ? 'buyer' : 'seller';
            await supabase
              .from('orders')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: cancelledBy,
              })
              .eq('id', order.id);
            // Return listing to available
            if (order.listing_id) {
              await supabase
                .from('listings')
                .update({ status: 'available', buyer_id: null, sold_at: null })
                .eq('id', order.listing_id);
            }
            // Record strike if seller cancels
            if (isSeller) {
              await supabase
                .from('cancellation_strikes')
                .insert({ seller_id: user!.id, order_id: order.id });
            }
            setSubmitting(false);
            fetchOrder();
          },
        },
      ]
    );
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
  const canCancel = (isBuyer || isSeller) && (order.status === 'paid' || order.status === 'created');
  const canShip = isSeller && order.status === 'paid';
  const canConfirm = isBuyer && order.status === 'shipped';
  const canDispute = isBuyer && order.status === 'shipped';

  return (
    <ScreenWrapper>
      <Header title="Order details" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: `${statusColor}18` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>

        {/* Item card */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Item</Text>
          <View style={styles.itemRow}>
            {order.listing?.images?.[0] ? (
              <Image
                source={{ uri: order.listing.images[0] }}
                style={styles.itemImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: colors.surfaceAlt }]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {order.listing?.title ?? 'Listing removed'}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.textPrimary }]}>
                {formatGBP(order.item_price)}
              </Text>
            </View>
          </View>
        </View>

        {/* Order meta */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Details</Text>
          <MetaRow label="Order date" value={formatDate(order.created_at)} colors={colors} />
          <MetaRow label={isBuyer ? 'Seller' : 'Buyer'} value={isBuyer ? `@${order.seller?.username}` : `@${order.buyer?.username}`} colors={colors} />
          <MetaRow label="Item price" value={formatGBP(order.item_price)} colors={colors} />
          <MetaRow label="Buyer protection" value={formatGBP(order.protection_fee)} colors={colors} />
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <MetaRow label="Total paid" value={formatGBP(order.total_paid)} bold colors={colors} />
        </View>

        {/* Tracking info (shown once shipped) */}
        {order.status !== 'created' && order.status !== 'paid' && order.tracking_number && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tracking</Text>
            {order.courier ? (
              <MetaRow label="Courier" value={order.courier} colors={colors} />
            ) : null}
            <MetaRow label="Tracking number" value={order.tracking_number} colors={colors} />
            {order.shipped_at && (
              <MetaRow label="Shipped on" value={formatDate(order.shipped_at)} colors={colors} />
            )}
          </View>
        )}

        {/* ── SELLER: enter tracking + mark shipped ─────────────── */}
        {canShip && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Ship this order</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Enter tracking details and mark as shipped. The buyer has 2 days to confirm receipt.
            </Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                placeholder="Tracking number *"
                placeholderTextColor={colors.textSecondary}
                value={trackingNumber}
                onChangeText={setTrackingNumber}
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
                autoCapitalize="words"
              />
            </View>
            <Button
              label="Mark as shipped"
              onPress={handleMarkShipped}
              loading={submitting}
            />
          </View>
        )}

        {/* ── BUYER: confirm receipt + dispute ─────────────────── */}
        {(canConfirm || canDispute) && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Has your item arrived?</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Confirming receipt releases payment to the seller. If there's a problem, raise a dispute instead.
            </Text>
            <View style={styles.actionRow}>
              {canDispute && (
                <Button
                  label="Raise dispute"
                  variant="outline"
                  onPress={() => router.push(`/order/${order.id}/dispute`)}
                  style={styles.halfBtn}
                />
              )}
              {canConfirm && (
                <Button
                  label="Item received"
                  onPress={handleConfirmReceipt}
                  loading={submitting}
                  style={styles.halfBtn}
                />
              )}
            </View>
          </View>
        )}

        {/* Cancel */}
        {canCancel && (
          <TouchableOpacity style={styles.cancelLink} onPress={handleCancel}>
            <Text style={[styles.cancelText, { color: colors.error }]}>Cancel order</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function MetaRow({
  label,
  value,
  bold,
  colors,
}: {
  label: string;
  value: string;
  bold?: boolean;
  colors: ColorTokens;
}) {
  return (
    <View style={metaStyles.row}>
      <Text style={[metaStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: colors.textPrimary, fontFamily: bold ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
        {value}
      </Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  value: { fontSize: 13 },
});

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.large,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
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
    itemRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    itemImage: {
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
    metaDivider: {
      height: 1,
    },
    hint: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
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
      fontFamily: 'Inter_400Regular',
    },
    actionRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    halfBtn: {
      flex: 1,
    },
    cancelLink: {
      alignItems: 'center',
      paddingVertical: Spacing.base,
    },
    cancelText: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    notFound: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notFoundText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
  });
}
