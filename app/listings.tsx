import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type SortOption = 'newest' | 'price_asc' | 'price_desc';

const PAGE_SIZE = 16;

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
};

const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'] as const;
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'] as const;

async function fetchPage(
  page: number,
  userId: string,
  categories: string[],
  sort: SortOption,
  condition: string | null,
  occasion: string | null,
): Promise<Listing[]> {
  let query = supabase
    .from('listings')
    .select('*, seller:users(username, avatar_url)')
    .eq('status', 'available')
    .neq('seller_id', userId);

  if (categories.length > 0) query = query.in('category', categories);
  if (condition) query = query.eq('condition', condition);
  if (occasion) query = query.eq('occasion', occasion);

  if (sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  return (data ?? []) as unknown as Listing[];
}

export default function ListingsScreen() {
  const { title = 'Listings', categories: categoriesParam } = useLocalSearchParams<{
    title: string;
    categories?: string;
  }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const categoriesStr = Array.isArray(categoriesParam) ? categoriesParam[0] : (categoriesParam ?? '');
  const categories = categoriesStr ? categoriesStr.split(',').filter(Boolean) : [];

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState<SortOption>('newest');
  const [condition, setCondition] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const pageRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    if (!user) return;
    const pageNum = reset ? 0 : pageRef.current;
    const items = await fetchPage(pageNum, user.id, categories, sort, condition, occasion);
    if (reset) {
      setListings(items);
      pageRef.current = 1;
    } else {
      setListings(prev => [...prev, ...items]);
      pageRef.current = pageNum + 1;
    }
    setHasMore(items.length === PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, categoriesStr, sort, condition, occasion]);

  useEffect(() => {
    setLoading(true);
    load(true).finally(() => setLoading(false));
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, load]);

  const showSortSheet = () => {
    Alert.alert(
      'Sort by',
      undefined,
      [
        ...(['newest', 'price_asc', 'price_desc'] as SortOption[]).map(option => ({
          text: sort === option ? `✓  ${SORT_LABELS[option]}` : SORT_LABELS[option],
          onPress: () => setSort(option),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const showFilterSheet = () => {
    Alert.alert(
      'Filter',
      undefined,
      [
        { text: 'Condition', onPress: showConditionSheet },
        { text: 'Occasion', onPress: showOccasionSheet },
        ...((condition || occasion) ? [{ text: 'Clear all filters', style: 'destructive' as const, onPress: () => { setCondition(null); setOccasion(null); } }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const showConditionSheet = () => {
    Alert.alert(
      'Filter by condition',
      undefined,
      [
        ...CONDITIONS.map(cond => ({
          text: condition === cond ? `✓  ${cond}` : cond,
          onPress: () => setCondition(prev => (prev === cond ? null : cond)),
        })),
        { text: condition ? 'Clear' : 'Cancel', style: 'cancel' as const, onPress: () => setCondition(null) },
      ],
    );
  };

  const showOccasionSheet = () => {
    Alert.alert(
      'Filter by occasion',
      undefined,
      [
        ...OCCASIONS.map(occ => ({
          text: occasion === occ ? `✓  ${occ}` : occ,
          onPress: () => setOccasion(prev => (prev === occ ? null : occ)),
        })),
        { text: occasion ? 'Clear' : 'Cancel', style: 'cancel' as const, onPress: () => setOccasion(null) },
      ],
    );
  };

  const isSorted = sort !== 'newest';
  const isFiltered = condition !== null || occasion !== null;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlBtn, isSorted && styles.controlBtnActive]}
          onPress={showSortSheet}
          activeOpacity={0.8}
        >
          <Ionicons
            name="swap-vertical-outline"
            size={15}
            color={isSorted ? colors.background : colors.textPrimary}
          />
          <Text style={[styles.controlText, isSorted && styles.controlTextActive]}>Sort</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, isFiltered && styles.controlBtnActive]}
          onPress={showFilterSheet}
          activeOpacity={0.8}
        >
          <Ionicons
            name="options-outline"
            size={15}
            color={isFiltered ? colors.background : colors.textPrimary}
          />
          <Text style={[styles.controlText, isFiltered && styles.controlTextActive]}>
            {occasion ?? condition ?? 'Filter'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primaryText} style={styles.loader} />
      ) : (
        <FlatList
          data={listings}
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
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={colors.primaryText} style={styles.footerSpinner} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="shirt-outline" size={48} color={colors.textSecondary} />}
              heading="No listings found"
              subtext="Try adjusting your sort or filter."
            />
          }
        />
      )}
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    backBtn: { padding: Spacing.xs },
    headerTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: { width: 32 },
    controls: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingBottom: Spacing.md,
    },
    controlBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      height: 42,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    controlBtnActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary,
    },
    controlText: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    controlTextActive: {
      color: colors.background,
    },
    loader: { flex: 1 },
    content: { flexGrow: 1, paddingBottom: Spacing['2xl'] },
    row: { gap: Spacing.sm, marginBottom: Spacing.sm },
    footerSpinner: { paddingVertical: Spacing.base },
  });
}
