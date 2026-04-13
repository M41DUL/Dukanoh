import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type OrderStatus = 'created' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'cancelled';

interface Order {
  id: string;
  buyer_id: string;
  status: OrderStatus;
  item_price: number;
  created_at: string;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string } | null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  created: 'Placed',
  paid: 'Paid — ship when ready',
  shipped: 'Shipped — awaiting confirmation',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  created: '#F59E0B',
  paid: '#3735C5',
  shipped: '#3735C5',
  delivered: '#22C55E',
  completed: '#22C55E',
  disputed: '#FF4444',
  cancelled: '#9B9B9B',
};

// Statuses that need the seller to act
const ACTION_REQUIRED: OrderStatus[] = ['paid', 'disputed'];

export default function SellerOrdersScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select(`
        id, buyer_id, status, item_price, created_at,
        listing:listings(title, images),
        buyer:users!orders_buyer_id_fkey(username)
      `)
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as unknown as Order[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const past = orders.filter(o => ['completed', 'cancelled'].includes(o.status));

  const renderOrder = ({ item }: { item: Order }) => {
    const statusColor = STATUS_COLOR[item.status] ?? colors.textSecondary;
    const needsAction = ACTION_REQUIRED.includes(item.status);
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.surface }]}
        onPress={() => router.push(`/order/${item.id}`)}
        activeOpacity={0.75}
      >
        {item.listing?.images?.[0] ? (
          <Image
            source={{ uri: getImageUrl(item.listing.images[0], 'thumbnail') }}
            style={styles.thumb}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
        )}

        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.listing?.title ?? 'Listing removed'}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            @{item.buyer?.username ?? '—'} · £{item.item_price.toFixed(2)} · {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Text>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>

        {needsAction && (
          <View style={[styles.actionDot, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      <Header title="Orders received" showBack />

      {loading ? (
        <LoadingSpinner />
      ) : orders.length === 0 ? (
        <EmptyState
          heading="No orders yet"
          subtext="When buyers purchase your listings, their orders will appear here."
        />
      ) : (
        <FlatList
          data={[...active, ...past]}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderOrder}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            past.length > 0 && active.length > 0 ? (
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Past orders</Text>
            ) : null
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    list: {
      padding: Spacing.base,
      gap: Spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    thumb: {
      width: 52,
      height: 52,
      borderRadius: BorderRadius.medium,
    },
    info: {
      flex: 1,
      gap: 3,
    },
    title: {
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
    },
    meta: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    statusText: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    actionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    },
    separator: {
      height: Spacing.xs,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xs,
    },
  });
}
