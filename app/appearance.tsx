import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Divider } from '@/components/Divider';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/context/ThemeContext';
import type { ThemePreference } from '@/context/ThemeContext';

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function AppearanceScreen() {
  const { preference, setPreference } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <ScreenWrapper>
      <Header title="Appearance" showBack />
      <View>
        {THEME_OPTIONS.map((opt, i) => (
          <View key={opt.value}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => setPreference(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.label}>{opt.label}</Text>
              <View style={[styles.radio, preference === opt.value && styles.radioSelected]}>
                {preference === opt.value && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
            {i < THEME_OPTIONS.length - 1 && <Divider style={{ marginVertical: 0 }} />}
          </View>
        ))}
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: (Spacing.md + 2) * 2,
    },
    label: {
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textPrimary,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: colors.primary,
    },
    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
  });
}
