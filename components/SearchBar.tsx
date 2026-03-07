import React, { useState, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, BorderWidth, Spacing, Typography, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: (query: string) => void;
  style?: ViewStyle;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search for anything',
  onClear,
  onFocus,
  onBlur,
  onSubmit,
  style,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={[styles.container, focused && styles.focused, style]}>
      <Ionicons
        name="search-outline"
        size={18}
        color={colors.textSecondary}
        style={styles.icon}
      />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onSubmitEditing={() => onSubmit?.(value)}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={handleClear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.base,
      height: 46,
      borderWidth: BorderWidth.standard,
      borderColor: 'transparent',
    },
    focused: {
      borderColor: colors.primary,
    },
    icon: {
      marginRight: Spacing.sm,
    },
    input: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
  });
}
