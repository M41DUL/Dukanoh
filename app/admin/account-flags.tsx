import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Divider } from '@/components/Divider';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type SellerTier = 'free' | 'pro' | 'founder';

interface Flags {
  is_seller: boolean;
  is_verified: boolean;
  seller_tier: SellerTier;
  tax_hold: boolean;
  tax_id_collected_at: string | null;
}

const TIERS: SellerTier[] = ['free', 'pro', 'founder'];

export default function AccountFlagsScreen() {
  const { user, refreshProfile } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [flags, setFlags] = useState<Flags | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('is_seller, is_verified, seller_tier, tax_hold, tax_id_collected_at')
      .eq('id', user.id)
      .single();
    if (data) setFlags(data as Flags);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const update = async (patch: Partial<Flags>) => {
    if (!user || !flags) return;
    const next = { ...flags, ...patch };
    setFlags(next);
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not update flag. Please try again.');
      setFlags(flags);
    } else {
      await refreshProfile();
    }
  };

  if (!flags) {
    return (
      <ScreenWrapper>
        <Header title="Account Flags" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Account Flags" showBack />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <Text style={styles.notice}>
          These flags control how this account behaves in the app. Use them to test different user states.
        </Text>

        {/* Toggles */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowTitle}>Seller</Text>
              <Text style={styles.rowSub}>Can list and sell items</Text>
            </View>
            <Switch
              value={flags.is_seller}
              onValueChange={v => update({ is_seller: v })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              disabled={saving}
            />
          </View>

          <Divider style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowTitle}>Verified</Text>
              <Text style={styles.rowSub}>Shows ✓ Verified badge</Text>
            </View>
            <Switch
              value={flags.is_verified}
              onValueChange={v => update({ is_verified: v })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
              disabled={saving}
            />
          </View>
        </View>

        {/* Tax state */}
        <Text style={styles.sectionTitle}>Tax / DAC7</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowTitle}>Tax hold</Text>
              <Text style={styles.rowSub}>Hides all listings until TIN is submitted</Text>
            </View>
            <Switch
              value={flags.tax_hold}
              onValueChange={v => update({ tax_hold: v })}
              trackColor={{ false: colors.border, true: '#DC2626' }}
              thumbColor="#FFFFFF"
              disabled={saving}
            />
          </View>

          <Divider style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowTitle}>TIN on file</Text>
              <Text style={styles.rowSub}>
                {flags.tax_id_collected_at
                  ? `Submitted ${new Date(flags.tax_id_collected_at).toLocaleDateString('en-GB')}`
                  : 'Not submitted yet'}
              </Text>
            </View>
            {flags.tax_id_collected_at && (
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Clear TIN?',
                  'This will remove the stored tax details so you can test the collection flow again.',
                  [
                    { text: 'Clear', style: 'destructive', onPress: () => update({ tax_id_collected_at: null } as any) },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                )}
                hitSlop={8}
                disabled={saving}
              >
                <Text style={[styles.rowSub, { color: colors.error }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Seller tier */}
        <Text style={styles.sectionTitle}>Seller tier</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {TIERS.map((tier, i) => (
            <View key={tier}>
              <TouchableOpacity
                style={styles.tierRow}
                onPress={() => update({ seller_tier: tier })}
                activeOpacity={0.7}
                disabled={saving}
              >
                <Text style={styles.tierLabel}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Text>
                <View style={[
                  styles.tierRadio,
                  flags.seller_tier === tier && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}>
                  {flags.seller_tier === tier && <View style={styles.tierRadioInner} />}
                </View>
              </TouchableOpacity>
              {i < TIERS.length - 1 && <Divider style={styles.divider} />}
            </View>
          ))}
        </View>

        {saving && <Text style={styles.savingText}>Saving…</Text>}
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    notice: {
      ...Typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },
    card: {
      borderRadius: BorderRadius.large,
      paddingHorizontal: Spacing.base,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.base,
    },
    rowLabel: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      fontSize: 15,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    rowSub: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    divider: {
      marginVertical: 0,
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: -Spacing.sm,
    },
    tierRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.base,
    },
    tierLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    tierRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tierRadioInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
    },
    savingText: {
      ...Typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
