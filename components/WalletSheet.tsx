import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { edgeFetch } from '@/lib/edgeFetch';
import {
  Typography,
  Spacing,
  BorderRadius,
  FontFamily,
  type ColorTokens,
} from '@/constants/theme';

interface WalletData {
  available: number;
  pending: number;
  lifetime: number;
}

interface WalletSheetProps {
  visible: boolean;
  onClose: () => void;
  hideBalances?: boolean;
}

export function WalletSheet({ visible, onClose, hideBalances = false }: WalletSheetProps) {
  const { user, isVerified } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data }, { data: pendingOrders }] = await Promise.all([
      supabase
        .from('seller_wallet')
        .select('available_balance, pending_balance, lifetime_earned')
        .eq('seller_id', user.id)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('item_price')
        .eq('seller_id', user.id)
        .not('seller_verify_deadline', 'is', null)
        .not('status', 'in', '("cancelled","refunded")'),
    ]);

    setWallet(
      data
        ? {
            available: data.available_balance ?? 0,
            pending: data.pending_balance ?? 0,
            lifetime: data.lifetime_earned ?? 0,
          }
        : { available: 0, pending: 0, lifetime: 0 }
    );
    setPendingPayout(
      (pendingOrders ?? []).reduce((sum, o) => sum + (o.item_price ?? 0), 0)
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (visible) fetchData();
  }, [visible, fetchData]);

  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const lifetime = wallet?.lifetime ?? 0;

  const handleWithdraw = () => {
    Alert.alert(
      `Withdraw £${available.toFixed(2)}`,
      'Funds will be sent to your connected bank account within 3–5 business days.',
      [
        {
          text: 'Confirm',
          onPress: async () => {
            if (!user) return;
            setWithdrawing(true);

            try {
              const res = await edgeFetch('stripe-payout');

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                Alert.alert('Withdrawal failed', err?.error ?? 'Please try again.');
              } else {
                await fetchData();
                Alert.alert('Withdrawal requested', `£${available.toFixed(2)} is on its way to your bank.`);
              }
            } catch {
              Alert.alert('Something went wrong', 'Please check your connection and try again.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Wallet</Text>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <View style={styles.content}>
          {isVerified ? (
            <>
              {/* ── Balances ── */}
              {!hideBalances && (
                <>
                  <View style={styles.balanceRow}>
                    <View style={[styles.balanceMain, { backgroundColor: colors.primary }]}>
                      <Text style={styles.balanceMainLabel}>Available</Text>
                      <Text style={styles.balanceMainAmount}>£{available.toFixed(2)}</Text>
                    </View>
                    <View style={styles.balanceSide}>
                      <View style={[styles.balanceSideCard, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.balanceSideLabel, { color: colors.textSecondary }]}>
                          Pending
                        </Text>
                        <Text style={[styles.balanceSideAmount, { color: colors.textPrimary }]}>
                          £{pending.toFixed(2)}
                        </Text>
                      </View>
                      <View style={[styles.balanceSideCard, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.balanceSideLabel, { color: colors.textSecondary }]}>
                          Lifetime
                        </Text>
                        <Text style={[styles.balanceSideAmount, { color: colors.textPrimary }]}>
                          £{lifetime.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {pending > 0 && (
                    <View style={[styles.infoRow, { backgroundColor: colors.surface }]}>
                      <Ionicons name="time-outline" size={15} color={colors.amber} />
                      <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                        £{pending.toFixed(2)} is held in escrow and released once buyers confirm delivery.
                      </Text>
                    </View>
                  )}
                </>
              )}

              <Button
                label={available > 0 ? `Withdraw £${available.toFixed(2)}` : 'Nothing to withdraw'}
                onPress={handleWithdraw}
                disabled={available === 0 || withdrawing}
                loading={withdrawing}
                size="lg"
              />
            </>
          ) : (
            <>
              {/* Pending payout card — only if they have sales waiting */}
              {pendingPayout > 0 && (
                <View style={[styles.pendingPayoutCard, { backgroundColor: colors.surface }]}>
                  <View style={[styles.pendingPayoutIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="wallet-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.pendingPayoutText}>
                    <Text style={[styles.pendingPayoutAmount, { color: colors.textPrimary }]}>
                      £{pendingPayout.toFixed(2)} waiting for you
                    </Text>
                    <Text style={[styles.pendingPayoutSub, { color: colors.textSecondary }]}>
                      Get verified to receive your earnings
                    </Text>
                  </View>
                </View>
              )}

              {/* Unlock hero */}
              <View style={styles.unlockHero}>
                <View style={[styles.unlockIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="wallet-outline" size={28} color="#FFFFFF" />
                </View>
                <Text style={[styles.unlockTitle, { color: colors.textPrimary }]}>
                  Unlock your earnings
                </Text>
                <Text style={[styles.unlockBody, { color: colors.textSecondary }]}>
                  Verify your identity to start receiving payouts from your sales. Takes around 5 minutes.
                </Text>
              </View>

              <Button
                label="Get verified"
                onPress={() => { onClose(); router.push('/stripe-onboarding'); }}
                size="lg"
              />
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    title: {
      ...Typography.subheading,
      fontFamily: FontFamily.semibold,
      marginBottom: Spacing.lg,
    },
    content: {
      gap: Spacing.md,
      paddingBottom: Spacing.md,
    },

    // Balances
    balanceRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    balanceMain: {
      flex: 1.3,
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: 4,
      justifyContent: 'center',
    },
    balanceMainLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)',
    },
    balanceMainAmount: {
      fontSize: 26,
      fontFamily: FontFamily.bold,
      color: '#FFFFFF',
      letterSpacing: -0.5,
    },
    balanceSide: {
      flex: 1,
      gap: Spacing.sm,
    },
    balanceSideCard: {
      flex: 1,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
      justifyContent: 'center',
      gap: 2,
    },
    balanceSideLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    balanceSideAmount: {
      fontSize: 16,
      fontFamily: FontFamily.bold,
    },

    // Unlock hero (unverified sellers)
    unlockHero: {
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.lg,
    },
    unlockIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xs,
    },
    unlockTitle: {
      fontSize: 20,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    unlockBody: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Pending payout card (unverified sellers)
    pendingPayoutCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
    },
    pendingPayoutIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingPayoutText: {
      flex: 1,
      gap: 2,
    },
    pendingPayoutAmount: {
      fontSize: 15,
      fontFamily: FontFamily.semibold,
    },
    pendingPayoutSub: {
      ...Typography.caption,
      lineHeight: 17,
    },

    // Pending escrow note
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      borderRadius: BorderRadius.medium,
      padding: Spacing.md,
    },
    infoText: {
      flex: 1,
      ...Typography.caption,
      lineHeight: 18,
    },
  });
}
