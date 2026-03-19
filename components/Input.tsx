import React, { forwardRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Typography, BorderRadius, BorderWidth, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  placeholderColor?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  function Input({ label, error, icon, containerStyle, inputContainerStyle, placeholderColor, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View
          style={[
            styles.inputContainer,
            focused && styles.focused,
            !!error && styles.errorBorder,
            inputContainerStyle,
          ]}
        >
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <TextInput
            ref={ref}
            style={styles.input}
            placeholderTextColor={placeholderColor ?? colors.textSecondary}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...props}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
);

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { gap: Spacing.xs },
    label: { ...Typography.label, color: colors.textPrimary },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      paddingHorizontal: Spacing.base,
      minHeight: 52,
    },
    focused: { borderColor: colors.primary },
    errorBorder: { borderColor: colors.error },
    icon: { marginRight: Spacing.sm },
    input: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      paddingVertical: Spacing.base,
    },
    error: { ...Typography.caption, color: colors.error },
  });
}
