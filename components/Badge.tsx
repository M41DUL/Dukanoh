import React, { useMemo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Typography, BorderRadius, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface BadgeProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Badge({ label, active = false, onPress, style }: BadgeProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.badge, active ? styles.active : styles.inactive, style]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.badge, active ? styles.active : styles.inactive, style]}>
      <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>
        {label}
      </Text>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    badge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
    },
    active: { backgroundColor: colors.primary, borderColor: colors.primary },
    inactive: { backgroundColor: colors.background, borderColor: colors.border },
    label: { ...Typography.label },
    activeText: { color: '#FFFFFF' },
    inactiveText: { color: colors.textSecondary },
  });
}
