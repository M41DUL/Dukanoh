import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
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

export default function MyItemsScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<ItemTab>('selling');
  const [selling, setSelling] = useState<Listing[]>([]);
  const [drafts, setDrafts] = useState<Listing[]>([]);
  const [bought, setBought] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [sellingRes, draftsRes, boughtRes] = await Promise.all([
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
    ]);
    setSelling((sellingRes.data ?? []) as unknown as Listing[]);
    setDrafts((draftsRes.data ?? []) as unknown as Listing[]);
    setBought((boughtRes.data ?? []) as unknown as Listing[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const data = activeTab === 'selling' ? selling : activeTab === 'drafts' ? drafts : bought;
  const empty = EMPTY[activeTab];

  return (
    <ScreenWrapper>
      <Header title="My items" showBack />

      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as ItemTab)}
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
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
