import React, { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { ListingCard, Listing } from '@/components/ListingCard';
import { QueryStateView } from '@/components/QueryStateView';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useBlocked } from '@/context/BlockedContext';
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';

export default function SavedScreen() {
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const { savedIds } = useSaved();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const query = useQuery({
    queryKey: queryKeys.savedItems.list(user?.id),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('listing_id, listing:listings(*, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? [])
        .map(d => d.listing as Listing | null)
        .filter((l): l is Listing => l !== null);
    },
    enabled: !!user,
  });

  // Filter at render time so heart-taps elsewhere (which optimistically
  // update savedIds in SavedContext) instantly drop items here, even before
  // the background refetch settles.
  const items = useMemo(
    () => (query.data ?? []).filter(item =>
      !blockedIds.includes(item.seller_id) && savedIds.has(item.id),
    ),
    [query.data, blockedIds, savedIds],
  );

  return (
    <ScreenWrapper>
      <Header title="Saved" showBack />
      <QueryStateView
        query={query}
        isEmpty={items.length === 0}
        errorHeading="Couldn't load saved items"
        empty={{
          icon: <Ionicons name="heart-outline" size={48} color={colors.textSecondary} />,
          heading: 'Nothing saved yet',
          subtext: 'Tap the heart on any piece to save it here.',
        }}
      >
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              variant="grid"
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
        />
      </QueryStateView>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['2xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  });
}
