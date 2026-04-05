import React, { ReactNode, useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BorderRadius, BorderWidth, Spacing, ColorTokens } from '@/constants/theme';
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
  icon?: ReactNode;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
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
  icon,
  backgroundColor,
  textColor,
  borderColor,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const sz = sizeStyles[size];

  const colorOverrides: ViewStyle = {
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(borderColor ? { borderWidth: BorderWidth.standard, borderColor } : {}),
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        { height: sz.height, paddingHorizontal: sz.paddingHorizontal },
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        colorOverrides,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={textColor ?? (variant === 'primary' ? '#FFFFFF' : colors.primaryText)}
          size="small"
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconWrapper}>{icon}</View>}
          <Text
            style={[
              styles.label,
              { fontSize: sz.fontSize },
              variant === 'primary' && styles.primaryText,
              variant === 'secondary' && styles.secondaryText,
              variant === 'outline' && styles.outlineText,
              variant === 'ghost' && styles.ghostText,
              textColor ? { color: textColor } : {},
            ]}
            allowFontScaling={false}
          >
            {label}
          </Text>
        </View>
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
      flexDirection: 'row',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconWrapper: {
      marginRight: 8,
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.secondary },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: BorderWidth.standard,
      borderColor: colors.primary,
    },
    ghost: { backgroundColor: 'transparent' },
    disabled: { opacity: 0.5 },
    label: {
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.2,
    },
    primaryText: { color: '#FFFFFF' },
    secondaryText: { color: '#0D0D0D' },
    outlineText: { color: colors.primaryText },
    ghostText: { color: colors.primaryText },
  });
}
