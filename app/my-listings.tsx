import React, { useState, useCallback, useMemo } from 'react';
import { Alert, View, Text, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { ListingCard, Listing } from '@/components/ListingCard';
import { QueryStateView } from '@/components/QueryStateView';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { ActiveOrderExistsError, useDeleteListing } from '@/lib/mutations';
import {
  Spacing,
  BorderRadius,
  FontFamily,
  type ColorTokens,
} from '@/constants/theme';

type ItemTab = 'selling' | 'drafts' | 'bought';

const TABS: { key: ItemTab; label: string }[] = [
  { key: 'selling', label: 'Selling' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'bought', label: 'Bought' },
];

const EMPTY: Record<ItemTab, { heading: string; subtext: string; ctaLabel?: string; onCta?: () => void }> = {
  selling: {
    heading: 'No listings yet',
    subtext: 'List your first piece to start selling.',
    ctaLabel: 'Start selling',
    onCta: () => router.push('/(tabs)/sell'),
  },
  drafts: {
    heading: 'No drafts',
    subtext: 'Listings you save without publishing will appear here.',
  },
  bought: {
    heading: 'No purchases yet',
    subtext: 'Pieces you buy will appear here.',
    ctaLabel: 'Discover pieces',
    onCta: () => router.push('/(tabs)'),
  },
};

const SELLING_SELECT =
  'id, title, images, status, price, seller_id, created_at, sold_at, seller:users!listings_seller_id_fkey(username, avatar_url)';
const DRAFTS_SELECT =
  'id, title, images, status, price, seller_id, created_at, seller:users!listings_seller_id_fkey(username, avatar_url)';
const BOUGHT_SELECT =
  'id, title, images, status, price, seller_id, created_at, sold_at, seller:users!listings_seller_id_fkey(username, avatar_url)';

export default function MyItemsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<ItemTab>('selling');

  const sellingQuery = useQuery({
    queryKey: queryKeys.myListings.list(user?.id, 'selling'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select(SELLING_SELECT)
        .eq('seller_id', user!.id)
        .in('status', ['available', 'sold'])
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
    enabled: !!user,
  });

  const draftsQuery = useQuery({
    queryKey: queryKeys.myListings.list(user?.id, 'drafts'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select(DRAFTS_SELECT)
        .eq('seller_id', user!.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
    enabled: !!user,
  });

  const boughtQuery = useQuery({
    queryKey: queryKeys.myListings.list(user?.id, 'bought'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select(BOUGHT_SELECT)
        .eq('buyer_id', user!.id)
        .order('sold_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
    enabled: !!user,
  });

  const refetchAll = useCallback(async () => {
    await Promise.all([sellingQuery.refetch(), draftsQuery.refetch(), boughtQuery.refetch()]);
  }, [sellingQuery, draftsQuery, boughtQuery]);

  useRefreshOnFocus(refetchAll);

  const deleteListing = useDeleteListing();

  const handleLongPress = useCallback((item: Listing) => {
    if (activeTab === 'bought') return;
    Alert.alert(
      item.title,
      undefined,
      [
        { text: 'Edit', onPress: () => router.push(`/listing/edit/${item.id}`) },
        {
          text: 'Delete listing',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Delete listing',
            'This will permanently remove your listing. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  deleteListing.mutate(
                    {
                      listingId: item.id,
                      status: item.status,
                      images: item.images,
                    },
                    {
                      onError: (err) => {
                        if (err instanceof ActiveOrderExistsError) {
                          Alert.alert('Cannot delete', 'This listing has an active order in progress.');
                          return;
                        }
                        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete listing.');
                      },
                    },
                  );
                },
              },
            ]
          ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [activeTab, deleteListing]);

  const activeQuery = activeTab === 'selling'
    ? sellingQuery
    : activeTab === 'drafts'
      ? draftsQuery
      : boughtQuery;
  const data = activeQuery.data ?? [];
  const empty = EMPTY[activeTab];

  return (
    <ScreenWrapper>
      <Header title="My items" showBack />

      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as ItemTab)}
      />

      <QueryStateView
        query={activeQuery}
        isEmpty={data.length === 0}
        errorHeading="Couldn't load items"
        empty={empty}
      >
        <FlatList
          key={activeTab}
          data={data}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => {
                  if (activeTab === 'drafts') return router.push(`/listing/edit/${item.id}`);
                  router.push(`/listing/${item.id}`);
                }}
                onLongPress={() => handleLongPress(item)}
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
        />
      </QueryStateView>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    grid: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
    },
    gridRow: {
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    cardWrap: {
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
      fontFamily: FontFamily.semibold,
    },
  });
}
