import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';

interface BadgeProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Badge({ label, active = false, onPress, style }: BadgeProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.badge, active ? styles.active : styles.inactive, style]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.badge, active ? styles.active : styles.inactive, style]}>
      <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  active: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  inactive: { backgroundColor: Colors.background, borderColor: Colors.border },
  label: { ...Typography.label },
  activeText: { color: Colors.background },
  inactiveText: { color: Colors.textSecondary },
});
