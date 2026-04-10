import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, FontFamily } from '@/constants/theme';

export default function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={48} color="#FF4444" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.md,
  },
  title: {
    ...Typography.subheading,
    color: '#0D0D0D',
    textAlign: 'center',
  },
  message: {
    ...Typography.body,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    backgroundColor: '#3735C5',
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
    color: '#6B6B6B',
  },
});
