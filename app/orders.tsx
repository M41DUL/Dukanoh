import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { QueryStateView } from '@/components/QueryStateView';
import { getImageUrl } from '@/lib/imageUtils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
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
  buyer_id: string | null;
  seller_id: string | null;
  status: OrderStatus;
  item_price: number;
  created_at: string | null;
  listing: { title: string; images: string[] | null } | null;
  buyer: { username: string | null } | null;
  seller: { username: string | null } | null;
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

function getStatusColor(status: OrderStatus, colors: ColorTokens): string {
  const map: Record<OrderStatus, string> = {
    created: colors.amber,
    paid: colors.primary,
    shipped: colors.primary,
    delivered: colors.success,
    completed: colors.success,
    disputed: colors.error,
    cancelled: colors.textSecondary,
  };
  return map[status] ?? colors.textSecondary;
}

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

const ORDERS_SELECT = `
  id, buyer_id, seller_id, status, item_price, created_at,
  listing:listings(title, images),
  buyer:users!orders_buyer_id_fkey(username),
  seller:users!orders_seller_id_fkey(username)
`;

export default function OrdersScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<OrderTab>('sold');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const soldQuery = useQuery({
    queryKey: queryKeys.orders.list(user?.id, 'sold'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDERS_SELECT)
        .eq('seller_id', user!.id)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []).map(o => ({ ...o, status: o.status as OrderStatus })) as Order[];
    },
    enabled: !!user,
  });

  const boughtQuery = useQuery({
    queryKey: queryKeys.orders.list(user?.id, 'bought'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDERS_SELECT)
        .eq('buyer_id', user!.id)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []).map(o => ({ ...o, status: o.status as OrderStatus })) as Order[];
    },
    enabled: !!user,
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([soldQuery.refetch(), boughtQuery.refetch()]);
  }, [soldQuery, boughtQuery]);

  useRefreshOnFocus(refetchAll);

  const activeQuery = activeTab === 'sold' ? soldQuery : boughtQuery;

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
    const all = activeQuery.data ?? [];
    const statuses = FILTER_STATUSES[activeFilter];
    if (!statuses) return all;
    return all.filter(o => statuses.includes(o.status));
  }, [activeQuery.data, activeFilter]);

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

      <QueryStateView
        query={activeQuery}
        isEmpty={data.length === 0}
        errorHeading="Couldn't load orders"
        empty={empty}
      >
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
        />
      </QueryStateView>
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
  const statusColor = getStatusColor(order.status, colors);
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
          £{order.item_price.toFixed(2)}{order.created_at ? ` · ${new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
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
      marginHorizontal: -Spacing.base,
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
      ...FontFamily.medium,
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
      ...FontFamily.medium,
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
      ...FontFamily.semibold,
    },
    actionDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
  });
}
