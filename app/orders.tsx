import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getImageUrl } from '@/lib/imageUtils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  Typography,
  Spacing,
  BorderRadius,
  FontFamily,
  type ColorTokens,
} from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────

type OrderTab = 'sold' | 'bought';
type FilterKey = 'all' | 'in_progress' | 'completed' | 'cancelled';

type OrderStatus =
  | 'created' | 'paid' | 'shipped' | 'delivered'
  | 'completed' | 'disputed' | 'cancelled';

interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  item_price: number;
  created_at: string;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string } | null;
  seller: { username: string } | null;
}

// ─── Constants ────────────────────────────────────────────────

const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'sold', label: 'Sold' },
  { key: 'bought', label: 'Bought' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const FILTER_STATUSES: Record<FilterKey, OrderStatus[] | null> = {
  all: null,
  in_progress: ['created', 'paid', 'shipped', 'delivered', 'disputed'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  created: 'Placed',
  paid: 'Paid',
  shipped: 'Shipped',
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

// Statuses where the user needs to take action
const SELLER_ACTION: OrderStatus[] = ['paid', 'disputed'];
const BUYER_ACTION: OrderStatus[] = ['shipped', 'disputed'];

const EMPTY: Record<OrderTab, { heading: string; subtext: string; ctaLabel?: string; onCta?: () => void }> = {
  sold: {
    heading: 'No orders received yet',
    subtext: 'When a buyer purchases one of your listings, the order will appear here.',
    ctaLabel: 'Start selling',
    onCta: () => router.push('/(tabs)/sell'),
  },
  bought: {
    heading: 'No purchases yet',
    subtext: 'When you buy something, your order will appear here.',
    ctaLabel: 'Discover pieces',
    onCta: () => router.push('/(tabs)'),
  },
};

// ─── Screen ───────────────────────────────────────────────────

export default function OrdersScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<OrderTab>('sold');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [sold, setSold] = useState<Order[]>([]);
  const [bought, setBought] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [soldRes, boughtRes] = await Promise.all([
      supabase
        .from('orders')
        .select(`
          id, buyer_id, seller_id, status, item_price, created_at,
          listing:listings(title, images),
          buyer:users!orders_buyer_id_fkey(username),
          seller:users!orders_seller_id_fkey(username)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select(`
          id, buyer_id, seller_id, status, item_price, created_at,
          listing:listings(title, images),
          buyer:users!orders_buyer_id_fkey(username),
          seller:users!orders_seller_id_fkey(username)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    setSold((soldRes.data ?? []) as unknown as Order[]);
    setBought((boughtRes.data ?? []) as unknown as Order[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  // Reset filter when switching tabs
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as OrderTab);
    setActiveFilter('all');
  }, []);

  const handleFilterChange = useCallback((key: FilterKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(key);
  }, []);

  // Apply status filter to current tab's data
  const data = useMemo(() => {
    const all = activeTab === 'sold' ? sold : bought;
    const statuses = FILTER_STATUSES[activeFilter];
    if (!statuses) return all;
    return all.filter(o => statuses.includes(o.status));
  }, [activeTab, activeFilter, sold, bought]);

  const actionRequired = activeTab === 'sold' ? SELLER_ACTION : BUYER_ACTION;
  const empty = EMPTY[activeTab];

  return (
    <ScreenWrapper>
      <Header title="My orders" showBack />

      <TabBar
        tabs={ORDER_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Filter pills */}
      <View style={[styles.filtersRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                { borderColor: isActive ? colors.primary : colors.border },
                isActive && { backgroundColor: colors.primary },
              ]}
              onPress={() => handleFilterChange(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterPillText,
                { color: isActive ? '#FFFFFF' : colors.textSecondary },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          key={activeTab}
          data={data}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <OrderRow
              order={item}
              tab={activeTab}
              actionRequired={actionRequired}
              colors={colors}
              styles={styles}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              heading={empty.heading}
              subtext={empty.subtext}
              ctaLabel={empty.ctaLabel}
              onCta={empty.onCta}
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

// ─── Order row ────────────────────────────────────────────────

interface OrderRowProps {
  order: Order;
  tab: OrderTab;
  actionRequired: OrderStatus[];
  colors: ColorTokens;
  styles: ReturnType<typeof getStyles>;
}

function OrderRow({ order, tab, actionRequired, colors, styles }: OrderRowProps) {
  const statusColor = STATUS_COLOR[order.status] ?? colors.textSecondary;
  const needsAction = actionRequired.includes(order.status);
  const counterparty = tab === 'sold'
    ? order.buyer?.username
    : order.seller?.username;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface }]}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.75}
    >
      {order.listing?.images?.[0] ? (
        <Image
          source={{ uri: getImageUrl(order.listing.images[0], 'thumbnail') }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
      )}

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {order.listing?.title ?? 'Listing removed'}
        </Text>
        {counterparty && (
          <Text style={[styles.counterparty, { color: colors.textSecondary }]}>
            {tab === 'sold' ? 'Buyer' : 'Seller'}: @{counterparty}
          </Text>
        )}
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          £{order.item_price.toFixed(2)} · {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.statusPillText, { color: statusColor }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
        {needsAction && (
          <View style={[styles.actionDot, { backgroundColor: colors.primary }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    // Filter pills
    filtersRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    filterPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
    },
    filterPillText: {
      fontSize: 12,
      fontFamily: FontFamily.medium,
    },

    // List
    list: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
    },
    separator: {
      height: Spacing.xs,
    },

    // Order row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
    },
    thumb: {
      width: 52,
      height: 66,
      borderRadius: BorderRadius.medium,
      flexShrink: 0,
    },
    info: {
      flex: 1,
      gap: 3,
    },
    title: {
      ...Typography.body,
      fontFamily: FontFamily.medium,
    },
    counterparty: {
      ...Typography.caption,
    },
    meta: {
      ...Typography.caption,
    },
    right: {
      alignItems: 'flex-end',
      gap: Spacing.xs,
      flexShrink: 0,
    },
    statusPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    statusPillText: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
    },
    actionDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
  });
}
