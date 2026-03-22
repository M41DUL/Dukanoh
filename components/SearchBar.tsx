import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Keyboard,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, BorderWidth, Spacing, Typography, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { SearchHistoryDropdown } from '@/components/SearchHistoryDropdown';

const ANIM_DURATION = 250;

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
  onFocusChange?: (focused: boolean) => void;
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
  onFocusChange,
  showHistory = false,
  style,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [animPlaceholder, setAnimPlaceholder] = useState(PLACEHOLDER_PREFIX);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

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

  const enterFocus = useCallback(() => {
    setFocused(true);
    setShowContent(true);
    Animated.timing(focusAnim, {
      toValue: 1,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start();
    onFocus?.();
    onFocusChange?.(true);
  }, [focusAnim, onFocus, onFocusChange]);

  const exitFocus = useCallback(() => {
    Animated.timing(focusAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setShowContent(false);
    });
    setFocused(false);
    Keyboard.dismiss();
    onBlur?.();
    onFocusChange?.(false);
  }, [focusAnim, onBlur, onFocusChange]);

  const handleCancel = useCallback(() => {
    onChangeText('');
    exitFocus();
    onClear?.();
  }, [onChangeText, exitFocus, onClear]);

  const handleSubmit = useCallback((term: string) => {
    if (showHistory && term.trim()) saveSearch(term.trim());
    exitFocus();
    onSubmit?.(term);
  }, [showHistory, saveSearch, exitFocus, onSubmit]);

  const handleHistorySelect = useCallback((term: string) => {
    onChangeText(term);
    if (showHistory) saveSearch(term);
    exitFocus();
    onSubmit?.(term);
  }, [showHistory, saveSearch, onChangeText, exitFocus, onSubmit]);

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  const displayPlaceholder = placeholder ?? animPlaceholder;
  const recentFiltered = showHistory ? filteredRecent(value) : [];
  const showInline = showHistory && showContent;

  const cancelOpacity = focusAnim;
  const cancelTranslateX = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });
  const historyOpacity = focusAnim;

  return (
    <View style={styles.wrapper}>
      <View style={styles.barRow}>
        <View style={[styles.container, focused && styles.focused, style]}>
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.textSecondary}
            style={styles.icon}
          />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={displayPlaceholder}
            placeholderTextColor={colors.textSecondary}
            onFocus={enterFocus}
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
        {showInline && (
          <Animated.View style={{ opacity: cancelOpacity, transform: [{ translateX: cancelTranslateX }] }}>
            <TouchableOpacity onPress={handleCancel} hitSlop={8} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {showInline && (
        <Animated.View style={{ opacity: historyOpacity }}>
          <SearchHistoryDropdown
            query={value}
            recentFiltered={recentFiltered}
            onSelect={handleHistorySelect}
            onRemove={removeSearch}
            onClearAll={clearSearches}
            inline
          />
        </Animated.View>
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    wrapper: {
      zIndex: 10,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    container: {
      flex: 1,
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
    cancelBtn: {
      paddingVertical: Spacing.sm,
    },
    cancelText: {
      ...Typography.body,
      color: colors.primary,
      fontFamily: 'Inter_500Medium',
    },
  });
}
