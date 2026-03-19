import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Typography, Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const PERKS = [
  { icon: 'people-outline', text: 'Sell to a trusted South Asian community' },
  { icon: 'shield-checkmark-outline', text: 'Every seller is personally vouched for' },
  { icon: 'storefront-outline', text: 'Your own seller profile and storefront' },
];

export default function BecomeSellerScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) { setError('Please enter your invite code'); return; }
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const { data: consumed, error: consumeError } = await supabase.rpc('consume_invite', {
        p_code: code.trim().toUpperCase(),
      });

      if (consumeError || !consumed) {
        setError('Invalid or already used invite code');
        return;
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ is_seller: true })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setConfirmed(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <ScreenWrapper>
        <Header showBack title="" />
        <View style={styles.confirmedContainer}>
          <View style={[styles.confirmedIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="checkmark" size={40} color={colors.primary} />
          </View>
          <Text style={styles.confirmedTitle}>You're in!</Text>
          <Text style={styles.confirmedSubtitle}>
            Welcome to the Dukanoh seller community. Start listing your items and reach buyers across the community.
          </Text>
          <Button
            label="Start selling"
            onPress={() => router.replace('/(tabs)/sell')}
            style={styles.confirmedCta}
          />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header showBack title="Become a seller" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <Text style={styles.heading}>Sell with confidence</Text>
          <Text style={styles.subheading}>
            Dukanoh sellers are invite-only. Every seller is personally vouched for, keeping our community trusted and safe.
          </Text>
        </View>

        <View style={[styles.perksCard, { backgroundColor: colors.surface }]}>
          {PERKS.map((perk, i) => (
            <View key={i} style={[styles.perkRow, i < PERKS.length - 1 && styles.perkBorder]}>
              <View style={[styles.perkIcon, { backgroundColor: colors.background }]}>
                <Ionicons name={perk.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={styles.perkText}>{perk.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.codeSection}>
          <Text style={styles.codeLabel}>Have an invite code?</Text>
          <Input
            placeholder="Enter your code"
            value={code}
            onChangeText={text => { setCode(text); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error}
          />
          <Button
            label="Become a seller"
            onPress={handleSubmit}
            loading={loading}
          />
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['4xl'],
      gap: Spacing.xl,
    },
    heroSection: { gap: Spacing.sm },
    heading: {
      fontSize: 26,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    subheading: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    perksCard: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
    },
    perkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.base,
    },
    perkBorder: {
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    perkIcon: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
    },
    perkText: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    codeSection: { gap: Spacing.base },
    codeLabel: {
      ...Typography.label,
      color: colors.textPrimary,
    },
    // Confirmation state
    confirmedContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.base,
    },
    confirmedIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    confirmedTitle: {
      fontSize: 28,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    confirmedSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    confirmedCta: {
      alignSelf: 'stretch',
      marginTop: Spacing.xl,
    },
  });
}
