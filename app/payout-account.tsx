import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { edgeFetch } from '@/lib/edgeFetch';
import { Ionicons } from '@expo/vector-icons';

export default function PayoutAccountScreen() {
  const { user, isVerified } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);

  const handleManageAccount = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const res = await edgeFetch('stripe-login-link');

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Something went wrong', err?.error ?? 'Could not open account management. Please try again.');
        return;
      }

      const { url } = await res.json();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Something went wrong', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isVerified) {
    return (
      <ScreenWrapper>
        <Header title="Payout Account" showBack />
        <View style={styles.emptyState}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="card-outline" size={32} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Not verified yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Complete Dukanoh Verify to set up your payout account and receive payments.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Payout Account" showBack />
      <View style={styles.content}>
        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.iconRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrapSmall, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="card-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Bank account</Text>
              <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
                Manage your payout bank details via Stripe
              </Text>
            </View>
          </View>
          <View style={styles.iconRow}>
            <View style={[styles.iconWrapSmall, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Verified account</Text>
              <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
                Your identity has been confirmed
              </Text>
            </View>
          </View>
        </View>

        <Button
          label="Manage payout account"
          onPress={handleManageAccount}
          loading={loading}
        />

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          You'll be taken to Stripe's secure dashboard to view or update your bank details and payout settings.
        </Text>
      </View>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      flex: 1,
      paddingTop: Spacing.base,
      gap: Spacing.base,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 20,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCard: {
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: 'transparent',
    },
    iconWrapSmall: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    infoText: {
      flex: 1,
      gap: 2,
    },
    infoTitle: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
    },
    infoSub: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    disclaimer: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 17,
    },
  });
}
