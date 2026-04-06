import React, { useMemo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface RadioProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Radio({ label, selected, onPress }: RadioProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.outer, selected && styles.outerActive]}>
        {selected && <View style={styles.inner} />}
      </View>
      <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
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
    outer: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    outerActive: {
      borderColor: colors.primary,
    },
    inner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    label: {
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
      color: colors.textPrimary,
    },
    labelActive: {
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
