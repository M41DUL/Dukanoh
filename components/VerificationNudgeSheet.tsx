import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface VerificationNudgeSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export function VerificationNudgeSheet({ visible, onDismiss }: VerificationNudgeSheetProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleGetVerified = () => {
    onDismiss();
    router.push('/stripe-onboarding');
  };

  return (
    <BottomSheet visible={visible} onClose={onDismiss}>
      <View style={styles.container}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="wallet-outline" size={28} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          You're almost ready to get paid
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Complete a quick identity check to publish your listings and receive payouts when items sell. You can do this now or later from Settings.
        </Text>

        <Button
          label="Get verified"
          onPress={handleGetVerified}
          style={styles.primaryBtn}
        />
        <Button
          label="Later"
          variant="outline"
          onPress={onDismiss}
          borderColor={colors.border}
          textColor={colors.textSecondary}
        />
      </View>
    </BottomSheet>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing['2xl'],
      paddingTop: Spacing.md,
      gap: Spacing.md,
      alignItems: 'center',
    },
    iconWrap: {
      width: 60,
      height: 60,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xs,
    },
    title: {
      fontSize: 20,
      fontFamily: FontFamily.bold,
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      textAlign: 'center',
      lineHeight: 21,
    },
    primaryBtn: {
      alignSelf: 'stretch',
      marginTop: Spacing.xs,
    },
  });
}
