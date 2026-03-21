import React, { forwardRef, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, BorderRadius, BorderWidth, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  valid?: boolean;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  placeholderColor?: string;
  hintColor?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  function Input({ label, error, hint, valid, icon, rightIcon, containerStyle, inputContainerStyle, placeholderColor, hintColor, secureTextEntry, style: inputStyle, onFocus: onFocusProp, onBlur: onBlurProp, ...props }, ref) {
    const innerRef = useRef<TextInput>(null);
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(true);
    const colors = useThemeColors();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const isSecure = secureTextEntry && hidden;

    const setRefs = (node: TextInput | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node;
    };

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <Pressable
          onPress={() => innerRef.current?.focus()}
          style={[
            styles.inputContainer,
            focused && styles.focused,
            !!error && styles.errorBorder,
            valid && styles.validBorder,
            inputContainerStyle,
          ]}
        >
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <TextInput
            ref={setRefs}
            style={[styles.input, inputStyle]}
            placeholderTextColor={placeholderColor ?? colors.textSecondary}
            secureTextEntry={isSecure}
            onFocus={(e) => { setFocused(true); onFocusProp?.(e); }}
            onBlur={(e) => { setFocused(false); onBlurProp?.(e); }}
            {...props}
          />
          {secureTextEntry ? (
            <Pressable onPress={() => setHidden(h => !h)} hitSlop={8} style={styles.rightIcon} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={placeholderColor ?? colors.textSecondary} />
            </Pressable>
          ) : rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!error && hint ? <Text style={[styles.hint, hintColor ? { color: hintColor } : undefined]}>{hint}</Text> : null}
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
    validBorder: { borderColor: colors.success },
    icon: { marginRight: Spacing.sm },
    rightIcon: { marginLeft: Spacing.sm },
    input: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      paddingVertical: Spacing.base,
    },
    error: { ...Typography.caption, color: colors.error },
    hint: { ...Typography.caption, color: colors.textSecondary },
  });
}
