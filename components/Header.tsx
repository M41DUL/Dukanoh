import React, { useMemo } from 'react';
import { View, Text, TextStyle, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onSubtitlePress?: () => void;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  titleStyle?: TextStyle;
}

export function Header({ title, subtitle, onSubtitlePress, showBack = false, rightAction, titleStyle }: HeaderProps) {
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

      {title ? (
        <View style={styles.titleWrap}>
          <Text style={[styles.title, titleStyle]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            onSubtitlePress ? (
              <TouchableOpacity onPress={onSubtitlePress} activeOpacity={0.6}>
                <Text style={[styles.subtitle, styles.subtitleLink]} numberOfLines={1}>{subtitle}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            )
          ) : null}
        </View>
      ) : <View />}

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
    titleWrap: { flex: 1, alignItems: 'center' },
    title: { fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
    subtitle: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
    subtitleLink: { color: colors.primary },
  });
}
