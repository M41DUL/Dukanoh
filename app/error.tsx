import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        {__DEV__ ? error.message : 'An unexpected error occurred. Please try again.'}
      </Text>
      <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.8}>
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} activeOpacity={0.7}>
        <Text style={styles.homeLink}>Go to home</Text>
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
      gap: Spacing.md,
    },
    title: {
      ...Typography.subheading,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    message: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    retryBtn: {
      marginTop: Spacing.sm,
      backgroundColor: colors.primary,
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing.md,
      borderRadius: 100,
    },
    retryText: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: '#FFFFFF',
    },
    homeLink: {
      ...Typography.body,
      color: colors.textSecondary,
    },
  });
}
