import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/context/ThemeContext';

interface MarketingConsentSheetProps {
  visible: boolean;
  onAnswer: (consent: boolean) => Promise<void> | void;
}

const PERKS = [
  { icon: 'sparkles-outline', text: 'First dibs on new drops and limited collections' },
  { icon: 'pricetag-outline', text: 'Pro discounts and seasonal offers' },
  { icon: 'rocket-outline',   text: 'New features as we ship them' },
] as const;

export function MarketingConsentSheet({ visible, onAnswer }: MarketingConsentSheetProps) {
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async (consent: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    await onAnswer(consent);
  };

  return (
    <BottomSheet visible={visible} onClose={() => handleAnswer(false)} useModal>
      <Text style={styles.title}>Stay in the loop?</Text>
      <Text style={styles.subtitle}>
        Get the occasional notification from Dukanoh. We'll never spam you, and you can change this anytime in Privacy Settings.
      </Text>

      {PERKS.map(({ icon, text }) => (
        <View key={text} style={styles.perkRow}>
          <View style={[styles.iconWrap, { backgroundColor: isDark ? `${colors.secondary}22` : `${colors.primary}18` }]}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={isDark ? colors.secondary : colors.primary} />
          </View>
          <Text style={styles.perkText}>{text}</Text>
        </View>
      ))}

      <View style={styles.actions}>
        <Button
          label="Yes, send me updates"
          variant="primary"
          onPress={() => handleAnswer(true)}
          loading={submitting}
          disabled={submitting}
          style={{ alignSelf: 'stretch' }}
        />
        <TouchableOpacity onPress={() => handleAnswer(false)} activeOpacity={0.7} style={styles.notNow} disabled={submitting}>
          <Text style={styles.notNowText}>No thanks</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    title: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    subtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: Spacing.base,
    },
    perkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      paddingVertical: Spacing.sm,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      justifyContent: 'center',
    },
    perkText: {
      ...Typography.body,
      color: colors.textPrimary,
      ...FontFamily.medium,
      flex: 1,
      lineHeight: 20,
    },
    actions: {
      marginTop: Spacing.base,
      gap: Spacing.sm,
    },
    notNow: {
      paddingTop: Spacing.base,
    },
    notNowText: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
