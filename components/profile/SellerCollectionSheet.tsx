import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { ListingGrid } from '@/components/ListingGrid';
import { type Listing } from '@/components/ListingCard';
import { supabase } from '@/lib/supabase';
import { FontFamily, Spacing, type ColorTokens } from '@/constants/theme';

interface Props {
  visible: boolean;
  collectionId: string | null;
  collectionName: string;
  onClose: () => void;
  colors: ColorTokens;
}

export function SellerCollectionSheet({
  visible,
  collectionId,
  collectionName,
  onClose,
  colors,
}: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !collectionId) return;
    setLoading(true);
    supabase
      .from('listings')
      .select(
        'id, title, price, original_price, price_dropped_at, images, status, category, size, condition, save_count, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)'
      )
      .eq('collection_id', collectionId)
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setListings((data ?? []) as unknown as Listing[]);
        setLoading(false);
      });
  }, [visible, collectionId]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      fullScreen
      backgroundColor={colors.background}
      handleColor={colors.border}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{collectionName}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
        />
      ) : listings.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          No listings in this collection.
        </Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          <ListingGrid listings={listings} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
  },
  loader: {
    marginTop: Spacing['2xl'],
  },
  empty: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  grid: {
    paddingBottom: Spacing['2xl'],
  },
});
