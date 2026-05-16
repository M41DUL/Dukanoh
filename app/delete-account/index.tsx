import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

type Blocker = {
  kind:
    | 'official_account'
    | 'active_pro_subscription'
    | 'active_order_buyer'
    | 'active_order_seller'
    | 'wallet_balance_pending'
    | 'wallet_balance_available'
    | 'stripe_payout_pending'
    | 'stripe_payout_in_transit'
    | 'stripe_balance';
  message: string;
  order_id?: string;
  status?: string;
  amount?: number;
  resolve_at?: string;
  expires_at?: string;
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function blockerIcon(kind: Blocker['kind']): IoniconName {
  switch (kind) {
    case 'active_order_buyer':
    case 'active_order_seller':
      return 'bag-outline';
    case 'wallet_balance_pending':
    case 'wallet_balance_available':
    case 'stripe_payout_pending':
    case 'stripe_payout_in_transit':
    case 'stripe_balance':
      return 'card-outline';
    case 'active_pro_subscription':
      return 'star-outline';
    case 'official_account':
      return 'shield-checkmark-outline';
  }
}

function formatGbp(amount?: number) {
  if (amount == null) return '';
  return `£${amount.toFixed(2)}`;
}

function formatResolveAt(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function openSubscriptionSettings() {
  const url = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  Linking.openURL(url).catch(() => {});
}

function blockerAction(blocker: Blocker): { label: string; onPress: () => void } | null {
  switch (blocker.kind) {
    case 'active_order_buyer':
    case 'active_order_seller':
      if (blocker.order_id) {
        return {
          label: 'View order',
          onPress: () => router.push(`/order/${blocker.order_id}`),
        };
      }
      return null;
    case 'wallet_balance_available':
    case 'stripe_balance':
    case 'wallet_balance_pending':
    case 'stripe_payout_pending':
    case 'stripe_payout_in_transit':
      return { label: 'Go to wallet', onPress: () => router.push('/wallet') };
    case 'active_pro_subscription':
      return { label: 'Open subscription settings', onPress: openSubscriptionSettings };
    case 'official_account':
      return null;
  }
}

export default function DeleteAccountPreviewScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [blockers, setBlockers]   = useState<Blocker[]>([]);
  const [error, setError]         = useState<string | null>(null);

  const loadReadiness = useCallback(async (mode: 'load' | 'refresh' = 'load') => {
    if (mode === 'load') setLoading(true);
    else setRefresh(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc('check_deletion_readiness');
    if (rpcErr) {
      setError('Could not check your account. Try again in a moment.');
    } else {
      setBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
    }
    setLoading(false);
    setRefresh(false);
  }, []);

  // Re-check whenever the screen regains focus — covers the case where the
  // user opens an order or the wallet to resolve a blocker and comes back.
  useFocusEffect(useCallback(() => {
    loadReadiness('refresh');
  }, [loadReadiness]));

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Delete account" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <Header title="Delete account" showBack />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Try again" onPress={() => loadReadiness('load')} variant="outline" size="md" />
        </View>
      </ScreenWrapper>
    );
  }

  const isBlocked = blockers.length > 0;

  return (
    <ScreenWrapper>
      <Header title="Delete account" showBack />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadReadiness('refresh')}
            tintColor={colors.textSecondary}
          />
        }
      >
        {isBlocked ? (
          <>
            <Text style={styles.heading}>
              {blockers.length === 1
                ? '1 thing to resolve'
                : `${blockers.length} things to resolve`}
            </Text>
            <Text style={styles.subheading}>
              We need to settle anything in flight before your account can be removed.
            </Text>

            {blockers.map((b, i) => {
              const action = blockerAction(b);
              const resolveAt = formatResolveAt(b.resolve_at);
              return (
                <View key={`${b.kind}-${i}`} style={styles.blockerCard}>
                  <View style={styles.blockerIconWrap}>
                    <Ionicons name={blockerIcon(b.kind)} size={20} color={colors.error} />
                  </View>
                  <View style={styles.blockerBody}>
                    <Text style={styles.blockerMessage}>{b.message}</Text>
                    {b.amount != null && (
                      <Text style={styles.blockerMeta}>{formatGbp(b.amount)}</Text>
                    )}
                    {resolveAt && (
                      <Text style={styles.blockerMeta}>Clears around {resolveAt}</Text>
                    )}
                    {action && (
                      <TouchableOpacity onPress={action.onPress} style={styles.blockerAction}>
                        <Text style={styles.blockerActionText}>{action.label}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.heading}>Before you go</Text>
            <Text style={styles.subheading}>
              Deleting your account is permanent. Here's what happens.
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.infoHeading}>What we keep</Text>
              </View>
              <InfoRow text="Past orders and transactions (7 years, HMRC)" tone="neutral" />
              <InfoRow text="Tax records (6 years, HMRC and DAC7)" tone="neutral" />
              <InfoRow text="Reviews you wrote or received, shown as 'Deleted member'" tone="neutral" />
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                <Text style={styles.infoHeading}>What we remove</Text>
              </View>
              <InfoRow text="Your name, profile photo, bio, phone, address" tone="destructive" />
              <InfoRow text="Your saved items, collections, and follows" tone="destructive" />
              <InfoRow text="Your active listings (archived)" tone="destructive" />
              <InfoRow text="Your Stripe payout account (closed)" tone="destructive" />
            </View>

            <Button
              label="Continue"
              onPress={() => router.push('/delete-account/confirm')}
              variant="primary"
              size="lg"
              style={styles.continueBtn}
            />
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

function InfoRow({ text, tone }: { text: string; tone: 'neutral' | 'destructive' }) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const dotColor = tone === 'destructive' ? colors.error : colors.textSecondary;
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoDot, { backgroundColor: dotColor }]} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const getStyles = (colors: ColorTokens) => StyleSheet.create({
  scroll: {
    paddingTop:    Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.md,
  },
  heading: {
    ...FontFamily.semibold,
    fontSize:     22,
    color:        colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subheading: {
    ...FontFamily.regular,
    fontSize:     14,
    color:        colors.textSecondary,
    lineHeight:   20,
    marginBottom: Spacing.lg,
  },
  errorText: {
    ...FontFamily.regular,
    fontSize:  14,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  blockerCard: {
    flexDirection:   'row',
    gap:             Spacing.md,
    padding:         Spacing.base,
    backgroundColor: colors.surface,
    borderRadius:    BorderRadius.medium,
    marginBottom:    Spacing.md,
  },
  blockerIconWrap: {
    paddingTop: Spacing.xs / 2,
  },
  blockerBody: {
    flex: 1,
  },
  blockerMessage: {
    ...FontFamily.regular,
    fontSize:   14,
    color:      colors.textPrimary,
    lineHeight: 20,
  },
  blockerMeta: {
    ...FontFamily.regular,
    fontSize:  13,
    color:     colors.textSecondary,
    marginTop: Spacing.xs,
  },
  blockerAction: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
    marginTop:     Spacing.sm,
  },
  blockerActionText: {
    ...FontFamily.medium,
    fontSize: 14,
    color:    colors.primary,
  },
  infoCard: {
    padding:         Spacing.base,
    backgroundColor: colors.surface,
    borderRadius:    BorderRadius.medium,
    marginBottom:    Spacing.md,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    marginBottom:  Spacing.sm,
  },
  infoHeading: {
    ...FontFamily.semibold,
    fontSize: 14,
    color:    colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    marginTop:     Spacing.sm,
  },
  infoDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  infoText: {
    ...FontFamily.regular,
    flex:       1,
    color:      colors.textSecondary,
    fontSize:   14,
    lineHeight: 20,
  },
  continueBtn: {
    marginTop: Spacing.lg,
  },
});
