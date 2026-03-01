import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, showBack = false, rightAction }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {title ? <Text style={styles.title}>{title}</Text> : <View />}

      <View style={[styles.side, styles.sideRight]}>
        {rightAction ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  side: { width: 40 },
  sideRight: { alignItems: 'flex-end' },
  backButton: { padding: Spacing.xs },
  title: { ...Typography.subheading, color: Colors.textPrimary },
});
