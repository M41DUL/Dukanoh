import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { edgeFetch } from '@/lib/edgeFetch';

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

const CONFIRM_PHRASE = 'DELETE';

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
      return { label: 'Go to wallet', onPress: () => router.push('/wallet') };
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

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading]       = useState(true);
  const [blockers, setBlockers]     = useState<Blocker[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [confirmInput, setConfirm]  = useState('');
  const [deleting, setDeleting]     = useState(false);

  const loadReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc('check_deletion_readiness');
    if (rpcErr) {
      setError('Could not check your account. Try again in a moment.');
      setLoading(false);
      return;
    }
    setBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await edgeFetch('delete-account');
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setBlockers(Array.isArray(body?.blockers) ? body.blockers : []);
        setConfirm('');
        setDeleting(false);
        return;
      }
      if (!res.ok) {
        Alert.alert('Something went wrong', 'Could not delete your account. Try again in a moment.');
        setDeleting(false);
        return;
      }
      await signOut();
      router.replace('/(auth)/intro');
    } catch {
      Alert.alert('Something went wrong', 'Check your connection and try again.');
      setDeleting(false);
    }
  }, [signOut]);

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
          <Button label="Try again" onPress={loadReadiness} variant="outline" size="md" />
        </View>
      </ScreenWrapper>
    );
  }

  if (blockers.length > 0) {
    return (
      <ScreenWrapper>
        <Header title="Delete account" showBack />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.heading}>Resolve these first</Text>
          <Text style={styles.subheading}>
            We need to settle anything in flight before your account can be removed.
          </Text>

          {blockers.map((b, i) => {
            const action = blockerAction(b);
            const resolveAt = formatResolveAt(b.resolve_at);
            return (
              <View key={`${b.kind}-${i}`} style={styles.blockerCard}>
                <View style={styles.blockerIconWrap}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
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

          <View style={styles.footerActions}>
            <Button
              label="Re-check"
              onPress={loadReadiness}
              variant="outline"
              size="md"
            />
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE && !deleting;

  return (
    <ScreenWrapper>
      <Header title="Delete account" showBack />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>You're ready to delete</Text>
        <Text style={styles.subheading}>
          This is permanent. Once you confirm we'll remove your profile and sign you out.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoHeading}>What we remove</Text>
          <InfoRow text="Your name, profile photo, bio, phone, address" />
          <InfoRow text="Your saved items, collections, and follows" />
          <InfoRow text="Your active listings (archived)" />
          <InfoRow text="Your Stripe payout account (closed)" />
          <Text style={[styles.infoHeading, styles.infoHeadingSpaced]}>What we keep</Text>
          <InfoRow text="Past orders and transactions (7 years, HMRC)" />
          <InfoRow text="Tax records (6 years, HMRC and DAC7)" />
          <InfoRow text="Reviews you wrote or received, shown as 'Deleted member'" />
        </View>

        <Text style={styles.confirmLabel}>Type {CONFIRM_PHRASE} to confirm</Text>
        <TextInput
          value={confirmInput}
          onChangeText={setConfirm}
          placeholder={CONFIRM_PHRASE}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.confirmInput}
        />

        <Button
          label="Delete my account"
          onPress={() => {
            Alert.alert(
              'Delete account?',
              'This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: handleDelete },
              ],
            );
          }}
          variant="primary"
          size="lg"
          loading={deleting}
          disabled={!canConfirm}
          backgroundColor={colors.error}
          textColor="#FFFFFF"
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

function InfoRow({ text }: { text: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoBullet}>•</Text>
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
  footerActions: {
    marginTop: Spacing.md,
  },
  infoCard: {
    padding:         Spacing.base,
    backgroundColor: colors.surface,
    borderRadius:    BorderRadius.medium,
    marginBottom:    Spacing.lg,
  },
  infoHeading: {
    ...FontFamily.semibold,
    fontSize: 14,
    color:    colors.textPrimary,
  },
  infoHeadingSpaced: {
    marginTop: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.sm,
  },
  infoBullet: {
    ...FontFamily.regular,
    color:    colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  infoText: {
    ...FontFamily.regular,
    flex:       1,
    color:      colors.textSecondary,
    fontSize:   14,
    lineHeight: 20,
  },
  confirmLabel: {
    ...FontFamily.medium,
    fontSize:     13,
    color:        colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  confirmInput: {
    ...FontFamily.medium,
    height:            48,
    borderWidth:       BorderWidth.standard,
    borderColor:       colors.border,
    borderRadius:      BorderRadius.medium,
    paddingHorizontal: Spacing.base,
    fontSize:          16,
    color:             colors.textPrimary,
    backgroundColor:   colors.background,
  },
});
