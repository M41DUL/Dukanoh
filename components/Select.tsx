import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BottomSheet } from '@/components/BottomSheet';

export interface SelectHandle {
  open: () => void;
}

interface SelectProps {
  label?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
  error?: string;
  emptyMessage?: string;
}

export const Select = forwardRef<SelectHandle, SelectProps>(function Select({ label, required, placeholder = 'Select…', value, options, onSelect, error, emptyMessage }, ref) {
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }));
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleSelect = (option: string) => {
    onSelect(option);
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.field, !!error && styles.errorBorder]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.fieldText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} useModal>
        {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
        {options.length === 0 && emptyMessage ? (
          <Text style={styles.emptyMessage}>{emptyMessage}</Text>
        ) : (
          <ScrollView style={styles.optionList} bounces={false} showsVerticalScrollIndicator={false}>
            {options.map(item => (
              <TouchableOpacity
                key={item}
                style={styles.option}
                onPress={() => handleSelect(item)}
                activeOpacity={0.6}
              >
                <Text style={[styles.optionText, item === value && styles.optionSelected]}>
                  {item}
                </Text>
                {item === value && (
                  <Ionicons name="checkmark" size={20} color={colors.primaryText} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </BottomSheet>
    </View>
  );
});

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { gap: Spacing.sm },
    label: { ...Typography.label, color: colors.textPrimary },
    required: { color: colors.error },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      paddingHorizontal: Spacing.base,
      minHeight: 52,
    },
    errorBorder: { borderColor: colors.error },
    fieldText: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    placeholder: { color: colors.textSecondary },
    error: { ...Typography.caption, color: colors.error },
    optionList: {
      maxHeight: 380,
    },
    sheetTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginBottom: Spacing.base,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionText: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    optionSelected: {
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },
    emptyMessage: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: Spacing.xl,
    },
  });
}
