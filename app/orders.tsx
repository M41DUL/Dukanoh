import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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

type Tab = 'selling' | 'drafts' | 'bought';

const TABS: { key: Tab; label: string }[] = [
  { key: 'selling', label: 'Selling' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'bought', label: 'Bought' },
];

export default function OrdersScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<Tab>('selling');
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
        .select('*, seller:users!listings_seller_id_fkey(username, avatar_url)')
        .eq('seller_id', user.id)
        .in('status', ['available', 'sold'])
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('*, seller:users!listings_seller_id_fkey(username, avatar_url)')
        .eq('seller_id', user.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('*, seller:users!listings_seller_id_fkey(username, avatar_url)')
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

  const emptyProps = {
    selling: {
      heading: 'No listings yet',
      subtext: 'List your first item to start selling.',
      ctaLabel: 'Start selling',
      onCta: () => router.push('/(tabs)/sell'),
    },
    drafts: {
      heading: 'No drafts',
      subtext: 'Drafts will appear here when you save a listing.',
    },
    bought: {
      heading: 'No purchases yet',
      subtext: 'Items you buy will appear here.',
      ctaLabel: 'Browse listings',
      onCta: () => router.push('/(tabs)'),
    },
  };

  return (
    <ScreenWrapper>
      <Header title="My Orders" showBack />

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={(key) => setActiveTab(key as Tab)} />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={data}
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
                onPress={() =>
                  activeTab === 'drafts'
                    ? router.push(`/listing/edit/${item.id}`)
                    : router.push(`/listing/${item.id}`)
                }
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

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
