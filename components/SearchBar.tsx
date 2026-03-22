import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { SearchHistoryDropdown } from '@/components/SearchHistoryDropdown';

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
  showHistory?: boolean;
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
  showHistory = false,
  style,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [animPlaceholder, setAnimPlaceholder] = useState(PLACEHOLDER_PREFIX);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { filteredRecent, saveSearch, removeSearch, clearSearches } = useSearchHistory();

  useEffect(() => {
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

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setFocused(true);
    if (showHistory) setDropdownVisible(true);
    onFocus?.();
  }, [showHistory, onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.();
    if (showHistory) {
      // Delay hiding so tap events on dropdown items register first
      blurTimeoutRef.current = setTimeout(() => setDropdownVisible(false), 150);
    }
  }, [showHistory, onBlur]);

  const handleSubmit = useCallback((term: string) => {
    if (showHistory && term.trim()) saveSearch(term.trim());
    setDropdownVisible(false);
    onSubmit?.(term);
  }, [showHistory, saveSearch, onSubmit]);

  const handleHistorySelect = useCallback((term: string) => {
    onChangeText(term);
    if (showHistory) saveSearch(term);
    setDropdownVisible(false);
    onSubmit?.(term);
  }, [showHistory, saveSearch, onChangeText, onSubmit]);

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  const displayPlaceholder = placeholder ?? animPlaceholder;
  const recentFiltered = showHistory ? filteredRecent(value) : [];

  return (
    <View style={showHistory ? styles.wrapper : undefined}>
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
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={() => handleSubmit(value)}
          returnKeyType="search"
          clearButtonMode="never"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {showHistory && dropdownVisible && (
        <SearchHistoryDropdown
          query={value}
          recentFiltered={recentFiltered}
          onSelect={handleHistorySelect}
          onRemove={removeSearch}
          onClearAll={clearSearches}
        />
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrapper: {
      position: 'relative',
      zIndex: 10,
    },
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
