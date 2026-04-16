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
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('seller_wallet')
      .select('available_balance, pending_balance, lifetime_earned')
      .eq('seller_id', user.id)
      .maybeSingle();
    setWallet(
      data
        ? {
            available: data.available_balance ?? 0,
            pending: data.pending_balance ?? 0,
            lifetime: data.lifetime_earned ?? 0,
          }
        : { available: 0, pending: 0, lifetime: 0 }
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

            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
            const apiKey = process.env.EXPO_PUBLIC_INTERNAL_API_KEY;

            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/stripe-payout`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-dukanoh-key': apiKey ?? '',
                },
                body: JSON.stringify({ user_id: user.id }),
              });

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
          {/* ── Balances — standard users only ── */}
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

              {/* Pending escrow note */}
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

          {/* ── CTA ── */}
          {isVerified ? (
            <Button
              label={available > 0 ? `Withdraw £${available.toFixed(2)}` : 'Nothing to withdraw'}
              onPress={handleWithdraw}
              disabled={available === 0 || withdrawing}
              loading={withdrawing}
              size="lg"
            />
          ) : (
            <Button
              label="Complete Dukanoh Verify"
              onPress={() => { onClose(); router.push('/stripe-onboarding'); }}
              variant="outline"
              size="lg"
            />
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

    // Pending note
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
