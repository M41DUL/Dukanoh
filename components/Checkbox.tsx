import React, { useMemo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onPress: () => void;
}

export function Checkbox({ label, checked, onPress }: CheckboxProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.box, checked && styles.boxActive]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={[styles.label, checked && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: BorderRadius.small,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    boxActive: {
      borderColor: colors.textPrimary,
      backgroundColor: colors.textPrimary,
    },
    label: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    labelActive: {
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
