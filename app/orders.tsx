import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type Tab = 'selling' | 'drafts' | 'bought' | 'orders';

const TABS: { key: Tab; label: string }[] = [
  { key: 'selling', label: 'Selling' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'bought', label: 'Bought' },
  { key: 'orders', label: 'Orders' },
];

type OrderStatus = 'created' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'resolved' | 'cancelled';

interface Order {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  status: OrderStatus;
  item_price: number;
  total_paid: number;
  created_at: string;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string } | null;
  seller: { username: string } | null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  created: 'Placed',
  paid: 'Paid',
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

// Statuses that need user action
const ACTION_REQUIRED: OrderStatus[] = ['paid', 'shipped', 'disputed'];

export default function OrdersScreen() {
  const { user } = useAuth();
  const { tab } = useLocalSearchParams<{ tab?: Tab }>();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<Tab>('selling');

  // Honour ?tab= param from deep links (e.g. from Pro profile quick links)
  useEffect(() => {
    if (tab && ['selling', 'drafts', 'bought', 'orders'].includes(tab)) {
      setActiveTab(tab as Tab);
    }
  }, [tab]);
  const [selling, setSelling] = useState<Listing[]>([]);
  const [drafts, setDrafts] = useState<Listing[]>([]);
  const [bought, setBought] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [sellingRes, draftsRes, boughtRes, ordersRes] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, images, status, price, seller_id, created_at, sold_at, seller:users!listings_seller_id_fkey(username, avatar_url)')
        .eq('seller_id', user.id)
        .in('status', ['available', 'sold'])
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('id, title, images, status, price, seller_id, created_at, seller:users!listings_seller_id_fkey(username, avatar_url)')
        .eq('seller_id', user.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('id, title, images, status, price, seller_id, created_at, sold_at, seller:users!listings_seller_id_fkey(username, avatar_url)')
        .eq('buyer_id', user.id)
        .order('sold_at', { ascending: false }),
      supabase
        .from('orders')
        .select(`
          id, buyer_id, seller_id, listing_id, status, item_price, total_paid, created_at,
          listing:listings(title, images),
          buyer:users!orders_buyer_id_fkey(username),
          seller:users!orders_seller_id_fkey(username)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
    ]);

    setSelling((sellingRes.data ?? []) as unknown as Listing[]);
    setDrafts((draftsRes.data ?? []) as unknown as Listing[]);
    setBought((boughtRes.data ?? []) as unknown as Listing[]);
    setOrders((ordersRes.data ?? []) as unknown as Order[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // Map listing_id → order_id so sold listings can navigate to their order
  const listingOrderMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const o of orders) {
      if (o.listing_id) map[o.listing_id] = o.id;
    }
    return map;
  }, [orders]);

  const listingData = activeTab === 'selling' ? selling : activeTab === 'drafts' ? drafts : bought;

  const emptyProps = {
    selling: {
      heading: 'No listings yet',
      subtext: 'List your first piece to start selling.',
      ctaLabel: 'Start selling',
      onCta: () => router.push('/(tabs)/sell'),
    },
    drafts: {
      heading: 'No drafts',
      subtext: 'Drafts will appear here when you save a listing.',
    },
    bought: {
      heading: 'No purchases yet',
      subtext: 'Pieces you buy will appear here.',
      ctaLabel: 'Discover pieces',
      onCta: () => router.push('/(tabs)'),
    },
    orders: {
      heading: 'No orders yet',
      subtext: 'Your buying and selling orders will appear here.',
    },
  };

  return (
    <ScreenWrapper>
      <Header title="My Listings" showBack />

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={(key) => setActiveTab(key as Tab)} />

      {loading ? (
        <LoadingSpinner />
      ) : activeTab === 'orders' ? (
        <FlatList
          key="orders"
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLOR[item.status] ?? colors.textSecondary;
            const needsAction = ACTION_REQUIRED.includes(item.status);
            const isSelling = item.seller_id === user?.id;
            return (
              <TouchableOpacity
                style={[styles.orderRow, { backgroundColor: colors.surface }]}
                onPress={() => router.push(`/order/${item.id}`)}
                activeOpacity={0.75}
              >
                {/* Thumbnail */}
                {item.listing?.images?.[0] ? (
                  <Image
                    source={{ uri: getImageUrl(item.listing.images[0], 'thumbnail') }}
                    style={[styles.orderThumb]}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.orderThumb, { backgroundColor: colors.surfaceAlt }]} />
                )}

                <View style={styles.orderInfo}>
                  <Text style={[styles.orderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.listing?.title ?? 'Listing removed'}
                  </Text>
                  <Text style={[styles.orderMeta, { color: colors.textSecondary }]}>
                    {isSelling ? 'Selling' : 'Buying'} · £{item.item_price.toFixed(2)} · {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>

                <View style={styles.orderRight}>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
                    <Text style={[styles.statusPillText, { color: statusColor }]}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                  {needsAction && (
                    <View style={[styles.actionDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              heading={emptyProps.orders.heading}
              subtext={emptyProps.orders.subtext}
            />
          }
        />
      ) : (
        <FlatList
          key={`grid-${activeTab}`}
          data={listingData}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.cardWrapper}>
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => {
                  if (activeTab === 'drafts') return router.push(`/listing/edit/${item.id}`);
                  if (activeTab === 'selling' && item.status === 'sold' && listingOrderMap[item.id]) {
                    return router.push(`/order/${listingOrderMap[item.id]}`);
                  }
                  router.push(`/listing/${item.id}`);
                }}
              />
              {activeTab === 'selling' && (
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: item.status === 'sold' ? colors.secondary : colors.primary },
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    { color: item.status === 'sold' ? '#0D0D0D' : '#FFFFFF' },
                  ]}>
                    {item.status === 'sold' ? 'Sold' : 'Active'}
                  </Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              heading={emptyProps[activeTab].heading}
              subtext={emptyProps[activeTab].subtext}
              ctaLabel={(emptyProps[activeTab] as any).ctaLabel}
              onCta={(emptyProps[activeTab] as any).onCta}
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    listContent: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.sm,
    },
    orderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
    },
    orderThumb: {
      width: 56,
      height: 70,
      borderRadius: BorderRadius.medium,
    },
    orderInfo: {
      flex: 1,
      gap: 4,
    },
    orderTitle: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    orderMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    orderRight: {
      alignItems: 'flex-end',
      gap: 6,
    },
    statusPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    statusPillText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
    },
    actionDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    gridContent: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
    },
    gridRow: {
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    cardWrapper: {
      flex: 1,
      maxWidth: '50%',
    },
    statusBadge: {
      position: 'absolute',
      top: Spacing.sm,
      left: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    statusBadgeText: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
