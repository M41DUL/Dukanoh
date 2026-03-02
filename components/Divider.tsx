import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface DividerProps {
  style?: ViewStyle;
}

export function Divider({ style }: DividerProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        { height: 1, backgroundColor: colors.border, marginVertical: Spacing.base },
        style,
      ]}
    />
  );
}
