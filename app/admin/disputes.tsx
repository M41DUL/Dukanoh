import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface DisputedOrder {
  id: string;
  item_price: number;
  protection_fee: number;
  dispute_reason: string | null;
  dispute_description: string | null;
  disputed_at: string | null;
  created_at: string;
  listing_id: string | null;
  seller_id: string;
  buyer_id: string;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string } | null;
  seller: { username: string } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDisputesScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [disputes, setDisputes] = useState<DisputedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const checkAdminAndLoad = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Check if current user is in admin_user_ids
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'admin_user_ids')
      .single();

    const adminIds: string[] = JSON.parse(setting?.value ?? '[]');
    if (!adminIds.includes(user.id)) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);

    const { data } = await supabase
      .from('orders')
      .select(`
        id, item_price, protection_fee, dispute_reason, dispute_description,
        disputed_at, created_at, listing_id, seller_id, buyer_id,
        listing:listings(title, images),
        buyer:users!orders_buyer_id_fkey(username),
        seller:users!orders_seller_id_fkey(username)
      `)
      .eq('status', 'disputed')
      .order('disputed_at', { ascending: true });

    setDisputes((data ?? []) as unknown as DisputedOrder[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { checkAdminAndLoad(); }, [checkAdminAndLoad]));

  // Resolve in seller's favour → complete the order, seller gets paid
  const resolveForSeller = (order: DisputedOrder) => {
    Alert.alert(
      'Resolve for seller',
      `Release £${order.item_price.toFixed(2)} to @${order.seller?.username}? This marks the order as completed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve for seller',
          onPress: async () => {
            setResolving(order.id);
            await supabase
              .from('orders')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              .eq('id', order.id)
              .eq('status', 'disputed');
            setResolving(null);
            checkAdminAndLoad();
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Resolve in buyer's favour → cancel order, return listing to available
  const resolveForBuyer = (order: DisputedOrder) => {
    Alert.alert(
      'Resolve for buyer',
      `Cancel this order and return the listing to @${order.buyer?.username}? The seller will not be paid.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve for buyer',
          style: 'destructive',
          onPress: async () => {
            setResolving(order.id);
            await supabase
              .from('orders')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: 'system',
              })
              .eq('id', order.id)
              .eq('status', 'disputed');

            // Return listing to available if still linked
            if (order.listing_id) {
              await supabase
                .from('listings')
                .update({ status: 'available', buyer_id: null, sold_at: null })
                .eq('id', order.listing_id);
            }
            setResolving(null);
            checkAdminAndLoad();
          },
        },
      ],
      { cancelable: true }
    );
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Disputes" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (isAdmin === false) {
    return (
      <ScreenWrapper>
        <Header title="Disputes" showBack />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.accessDenied, { color: colors.textSecondary }]}>
            Admin access required
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title={`Disputes (${disputes.length})`} showBack />
      <FlatList
        data={disputes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* Item row */}
            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => router.push(`/order/${item.id}`)}
              activeOpacity={0.7}
            >
              {item.listing?.images?.[0] ? (
                <Image
                  source={{ uri: item.listing.images[0] }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {item.listing?.title ?? 'Listing removed'}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  @{item.buyer?.username} → @{item.seller?.username}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  £{item.item_price.toFixed(2)} · {item.disputed_at ? formatDate(item.disputed_at) : '—'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Reason + description */}
            {item.dispute_reason && (
              <View style={[styles.reasonPill, { backgroundColor: `${colors.error}14` }]}>
                <Text style={[styles.reasonText, { color: colors.error }]}>{item.dispute_reason}</Text>
              </View>
            )}
            {item.dispute_description && (
              <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
                {item.dispute_description}
              </Text>
            )}

            {/* Resolution actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}
                onPress={() => resolveForSeller(item)}
                disabled={resolving === item.id}
                activeOpacity={0.75}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.actionBtnText, { color: colors.success }]}>Seller wins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: `${colors.error}14`, borderColor: `${colors.error}40` }]}
                onPress={() => resolveForBuyer(item)}
                disabled={resolving === item.id}
                activeOpacity={0.75}
              >
                <Ionicons name="arrow-undo-outline" size={16} color={colors.error} />
                <Text style={[styles.actionBtnText, { color: colors.error }]}>Buyer wins</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            heading="No open disputes"
            subtext="All disputes have been resolved."
          />
        }
      />
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    list: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    thumb: {
      width: 56,
      height: 70,
      borderRadius: BorderRadius.medium,
      flexShrink: 0,
    },
    itemInfo: {
      flex: 1,
      gap: 3,
    },
    itemTitle: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      lineHeight: 18,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    reasonPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    reasonText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    description: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    actions: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingVertical: Spacing.md,
    },
    actionBtnText: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    accessDenied: {
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
    },
  });
}
