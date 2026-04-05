import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface BottomBarProps {
  children: React.ReactNode;
  /** Position absolute — overlays scroll content (listing detail pattern) */
  absolute?: boolean;
  style?: ViewStyle;
}

/**
 * Full-width bottom action bar.
 * Breaks out of ScreenWrapper's horizontal padding, draws a hairline border
 * across the full screen width, and handles safe-area bottom inset.
 */
export function BottomBar({ children, absolute = false, style }: BottomBarProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        absolute && styles.absoluteBar,
        {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + Spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: -Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  absoluteBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    marginHorizontal: 0,
  },
});
