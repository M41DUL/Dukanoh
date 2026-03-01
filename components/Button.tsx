import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

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
          color={variant === 'primary' ? Colors.background : Colors.primary}
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

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.secondary },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  primaryText: { color: Colors.background },
  secondaryText: { color: Colors.textPrimary },
  outlineText: { color: Colors.primary },
  ghostText: { color: Colors.primary },
});
