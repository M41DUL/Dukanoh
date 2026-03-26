import React, { useMemo } from 'react';
import { View, Text, TextStyle, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  titleStyle?: TextStyle;
}

export function Header({ title, showBack = false, rightAction, titleStyle }: HeaderProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : <View />}

      <View style={[styles.side, styles.sideRight]}>
        {rightAction ?? null}
      </View>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      marginHorizontal: -Spacing.base,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    side: { width: 40 },
    sideRight: { alignItems: 'flex-end' },
    backButton: { padding: Spacing.xs },
    title: { ...Typography.subheading, color: colors.textPrimary },
  });
}
