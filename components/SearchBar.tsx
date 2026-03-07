import React, { useState, useEffect, useRef, useMemo } from 'react';
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

const PLACEHOLDER_PREFIX = 'Search for ';
const PLACEHOLDER_TERMS = [
  'lehenga',
  'salwar kameez',
  'Eid kurta',
  'wedding dupatta',
  'achkan size M',
  'partywear size 10',
];

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
  placeholder,
  onClear,
  onFocus,
  onBlur,
  onSubmit,
  style,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [animPlaceholder, setAnimPlaceholder] = useState(PLACEHOLDER_PREFIX);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Use static placeholder if one is provided, or pause when focused/has value
    if (placeholder || focused || value.length > 0) return;

    let termIdx = 0;
    let charIdx = 0;
    let phase: 'typing' | 'holding' | 'deleting' = 'typing';

    const tick = () => {
      const term = PLACEHOLDER_TERMS[termIdx];

      if (phase === 'typing') {
        charIdx++;
        setAnimPlaceholder(`${PLACEHOLDER_PREFIX}${term.slice(0, charIdx)}`);
        if (charIdx === term.length) {
          phase = 'holding';
          timeoutRef.current = setTimeout(tick, 1500);
        } else {
          timeoutRef.current = setTimeout(tick, 80);
        }
      } else if (phase === 'holding') {
        phase = 'deleting';
        timeoutRef.current = setTimeout(tick, 40);
      } else {
        charIdx--;
        setAnimPlaceholder(`${PLACEHOLDER_PREFIX}${term.slice(0, charIdx)}`);
        if (charIdx === 0) {
          termIdx = (termIdx + 1) % PLACEHOLDER_TERMS.length;
          phase = 'typing';
          timeoutRef.current = setTimeout(tick, 300);
        } else {
          timeoutRef.current = setTimeout(tick, 40);
        }
      }
    };

    setAnimPlaceholder(PLACEHOLDER_PREFIX);
    timeoutRef.current = setTimeout(tick, 800);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [placeholder, focused, value]);

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  const displayPlaceholder = placeholder ?? animPlaceholder;

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
        placeholder={displayPlaceholder}
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
