import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface GradientCardProps {
  colors: [string, string];
  title: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function GradientCard({
  colors: gradientColors,
  title,
  subtitle,
  titleColor,
  subtitleColor,
  left,
  right,
  onPress,
  style,
}: GradientCardProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => getStyles(themeColors), [themeColors]);

  const content = (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, style]}
    >
      {left}
      <View style={styles.body}>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.sub, subtitleColor ? { color: subtitleColor } : null]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.full,
      padding: Spacing.base,
      gap: Spacing.sm,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    title: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    sub: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
  });
}
