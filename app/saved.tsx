import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useBlocked } from '@/context/BlockedContext';
import { useSaved } from '@/context/SavedContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function SavedScreen() {
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const { savedIds, toggleSave } = useSaved();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_items')
      .select('listing_id, listing:listings(*, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) {
      setItems(
        data
          .map(d => d.listing as unknown as Listing)
          .filter(Boolean)
          .filter(item => !blockedIds.includes(item.seller_id))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Remove unsaved items from the list in real-time as user taps hearts on cards
  useEffect(() => {
    setItems(prev => prev.filter(item => savedIds.has(item.id)));
  }, [savedIds]);

  return (
    <ScreenWrapper>
      <Header title="Saved" showBack />

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryText} style={styles.loader} />
      ) : (
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
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="heart-outline" size={48} color={colors.textSecondary} />}
              heading="Nothing saved yet"
              subtext="Tap the heart on any listing to save it here."
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    loader: { flex: 1 },
    content: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['2xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  });
}
