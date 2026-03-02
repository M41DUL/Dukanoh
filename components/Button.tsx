import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { BorderRadius, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

/**
 * Size variants:
 * - sm  — 36px height, 12px text — inline actions, tags, compact UIs
 * - md  — 44px height, 14px text — default for most use cases
 * - lg  — 52px height, 16px text — primary CTAs, full-width actions
 */
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: Spacing.md,   fontSize: 12 },
  md: { height: 44, paddingHorizontal: Spacing.lg,   fontSize: 14 },
  lg: { height: 52, paddingHorizontal: Spacing.xl,   fontSize: 16 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const sz = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.base,
        { height: sz.height, paddingHorizontal: sz.paddingHorizontal },
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.background : colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            { fontSize: sz.fontSize },
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'outline' && styles.outlineText,
            variant === 'ghost' && styles.ghostText,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.secondary },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    ghost: { backgroundColor: 'transparent' },
    disabled: { opacity: 0.5 },
    label: {
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.2,
    },
    primaryText: { color: colors.background },
    secondaryText: { color: colors.textPrimary },
    outlineText: { color: colors.primary },
    ghostText: { color: colors.primary },
  });
}
