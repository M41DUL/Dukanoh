import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { POPULAR_SEARCHES } from '@/hooks/useSearchHistory';

interface SearchHistoryDropdownProps {
  query: string;
  recentFiltered: string[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
  onClearAll: () => void;
}

export function SearchHistoryDropdown({
  query,
  recentFiltered,
  onSelect,
  onRemove,
  onClearAll,
}: SearchHistoryDropdownProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const trimmed = query.trim();
  const showRecent = recentFiltered.length > 0;
  const showPopular = !showRecent && !trimmed;

  if (!showRecent && !showPopular) return null;

  return (
    <View style={styles.container}>
      {showRecent && (
        <>
          {recentFiltered.map(term => (
            <Swipeable
              key={term}
              renderRightActions={() => (
                <TouchableOpacity
                  style={styles.swipeDelete}
                  onPress={() => onRemove(term)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              overshootRight={false}
            >
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.background }]}
                onPress={() => onSelect(term)}
                activeOpacity={0.6}
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.term}>{term}</Text>
              </TouchableOpacity>
            </Swipeable>
          ))}
          <TouchableOpacity onPress={onClearAll} hitSlop={8} style={styles.clearBtn}>
            <Text style={styles.clearLink}>Clear all</Text>
          </TouchableOpacity>
        </>
      )}

      {showPopular && (
        <>
          {POPULAR_SEARCHES.map(term => (
            <TouchableOpacity
              key={term}
              style={styles.row}
              onPress={() => onSelect(term)}
              activeOpacity={0.6}
            >
              <Ionicons name="trending-up-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.term}>{term}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        },
        android: {
          elevation: 6,
        },
      }),
      zIndex: 20,
    },
    clearBtn: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    clearLink: {
      ...Typography.caption,
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
    },
    term: {
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      color: colors.textPrimary,
    },
    swipeDelete: {
      backgroundColor: colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 60,
      borderRadius: BorderRadius.small,
      marginVertical: 2,
    },
  });
}
