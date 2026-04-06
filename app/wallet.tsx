import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Wallet {
  pending_balance: number;
  available_balance: number;
  lifetime_earned: number;
  updated_at: string;
}

interface RecentOrder {
  id: string;
  status: string;
  item_price: number;
  completed_at: string | null;
  created_at: string;
  listing: { title: string } | null;
  buyer: { username: string } | null;
}

function formatGBP(amount: number) {
  return `£${amount.toFixed(2)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function WalletScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        setLoading(true);

        const [{ data: walletData }, { data: ordersData }] = await Promise.all([
          supabase
            .from('seller_wallet')
            .select('*')
            .eq('seller_id', user.id)
            .maybeSingle(),
          supabase
            .from('orders')
            .select(`
              id, status, item_price, completed_at, created_at,
              listing:listings(title),
              buyer:users!orders_buyer_id_fkey(username)
            `)
            .eq('seller_id', user.id)
            .in('status', ['paid', 'shipped', 'completed'])
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        setWallet(walletData ?? { pending_balance: 0, available_balance: 0, lifetime_earned: 0, updated_at: '' });
        setRecentOrders((ordersData ?? []) as unknown as RecentOrder[]);
        setLoading(false);
      })();
    }, [user])
  );

  const handleWithdraw = () => {
    if (!wallet || wallet.available_balance <= 0) return;
    Alert.alert(
      'Withdraw funds',
      'Bank payouts will be available once you complete Dukanoh Verify. Set up Dukanoh Pay to start receiving payments.',
      [
        { text: 'Set up Dukanoh Verify', onPress: () => router.push('/stripe-onboarding') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Wallet" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  const pending = wallet?.pending_balance ?? 0;
  const available = wallet?.available_balance ?? 0;
  const lifetime = wallet?.lifetime_earned ?? 0;
  const canWithdraw = available > 0;

  return (
    <ScreenWrapper>
      <Header title="Wallet" showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance cards */}
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, styles.balanceCardMain, { backgroundColor: colors.primary }]}>
            <Text style={styles.balanceCardLabel}>Available</Text>
            <Text style={styles.balanceCardAmount}>{formatGBP(available)}</Text>
            <Text style={styles.balanceCardSub}>Ready to withdraw</Text>
          </View>
          <View style={styles.balanceColumn}>
            <View style={[styles.balanceCardSmall, { backgroundColor: colors.surface }]}>
              <Text style={[styles.balanceSmallLabel, { color: colors.textSecondary }]}>Pending</Text>
              <Text style={[styles.balanceSmallAmount, { color: colors.textPrimary }]}>{formatGBP(pending)}</Text>
            </View>
            <View style={[styles.balanceCardSmall, { backgroundColor: colors.surface }]}>
              <Text style={[styles.balanceSmallLabel, { color: colors.textSecondary }]}>Lifetime</Text>
              <Text style={[styles.balanceSmallAmount, { color: colors.textPrimary }]}>{formatGBP(lifetime)}</Text>
            </View>
          </View>
        </View>

        {/* Pending info */}
        {pending > 0 && (
          <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={16} color={colors.amber} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {formatGBP(pending)} is held in escrow and will be released when buyers confirm receipt (up to 2 days after shipping).
            </Text>
          </View>
        )}

        {/* Withdraw button */}
        <Button
          label={canWithdraw ? `Withdraw ${formatGBP(available)}` : 'Nothing to withdraw'}
          onPress={handleWithdraw}
          disabled={!canWithdraw}
        />

        {/* Payout info */}
        <View style={[styles.payoutInfo, { borderColor: colors.border }]}>
          <View style={styles.payoutRow}>
            <Ionicons name="card-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.payoutText, { color: colors.textSecondary }]}>
              Standard bank transfer — 3–5 business days
            </Text>
          </View>
          <TouchableOpacity
            style={styles.payoutRow}
            onPress={() => router.push('/stripe-onboarding')}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primaryText} />
            <Text style={[styles.payoutText, { color: colors.primaryText }]}>
              Set up Dukanoh Pay to receive payouts
            </Text>
          </TouchableOpacity>
        </View>

        {/* Transaction history */}
        {recentOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Recent orders</Text>
            <View style={styles.transactionList}>
              {recentOrders.map(order => (
                <TouchableOpacity
                  key={order.id}
                  style={[styles.transactionRow, { backgroundColor: colors.surface }]}
                  onPress={() => router.push(`/order/${order.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={styles.txLeft}>
                    <Text style={[styles.txTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {order.listing?.title ?? 'Listing removed'}
                    </Text>
                    <Text style={[styles.txMeta, { color: colors.textSecondary }]}>
                      @{order.buyer?.username} · {formatDate(order.completed_at ?? order.created_at)}
                    </Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, {
                      color: order.status === 'completed' ? colors.success : colors.textPrimary,
                    }]}>
                      {order.status === 'completed' ? '+' : ''}{formatGBP(order.item_price)}
                    </Text>
                    <Text style={[styles.txStatus, { color: colors.textSecondary }]}>
                      {order.status === 'completed' ? 'Released' : order.status === 'shipped' ? 'In transit' : 'Processing'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {recentOrders.length === 0 && (
          <View style={styles.emptyOrders}>
            <Ionicons name="wallet-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No orders yet. Sales will appear here once buyers purchase your listings.
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.base,
    },
    balanceRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    balanceCard: {
      flex: 1,
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: 4,
      justifyContent: 'center',
    },
    balanceCardMain: {
      flex: 1.3,
    },
    balanceCardLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)',
    },
    balanceCardAmount: {
      fontSize: 28,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    balanceCardSub: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      color: 'rgba(255,255,255,0.6)',
    },
    balanceColumn: {
      flex: 1,
      gap: Spacing.sm,
    },
    balanceCardSmall: {
      flex: 1,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
      justifyContent: 'center',
      gap: 2,
    },
    balanceSmallLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    balanceSmallAmount: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      borderRadius: BorderRadius.medium,
      padding: Spacing.md,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    payoutInfo: {
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    payoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    payoutText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    section: {
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    transactionList: {
      gap: Spacing.sm,
    },
    transactionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
      gap: Spacing.md,
    },
    txLeft: {
      flex: 1,
      gap: 3,
    },
    txTitle: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    txMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    txRight: {
      alignItems: 'flex-end',
      gap: 3,
    },
    txAmount: {
      fontSize: 14,
      fontFamily: 'Inter_700Bold',
    },
    txStatus: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
    },
    emptyOrders: {
      alignItems: 'center',
      paddingTop: Spacing['2xl'],
      gap: Spacing.md,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 260,
    },
  });
}
