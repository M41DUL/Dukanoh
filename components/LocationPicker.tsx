import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { City, ICity } from 'country-state-city';
import { BottomSheet } from '@/components/BottomSheet';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface LocationPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: string) => void;
}

const UK_CITIES = City.getCitiesOfCountry('GB') ?? [];

export function LocationPicker({ visible, onClose, onSelect }: LocationPickerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return UK_CITIES;
    const q = search.toLowerCase();
    return UK_CITIES.filter(c => c.name.toLowerCase().includes(q));
  }, [search]);

  const handleSelect = useCallback((city: ICity) => {
    onSelect(`${city.name}, United Kingdom`);
    setSearch('');
    onClose();
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    setSearch('');
    onClose();
  }, [onClose]);

  const renderCity = useCallback(({ item }: { item: ICity }) => (
    <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)} activeOpacity={0.6}>
      <Text style={styles.rowText} numberOfLines={1}>{item.name}</Text>
      {item.stateCode ? (
        <Text style={styles.regionText} numberOfLines={1}>{item.stateCode}</Text>
      ) : null}
    </TouchableOpacity>
  ), [styles, handleSelect]);

  return (
    <BottomSheet visible={visible} onClose={handleClose} fullScreen useModal>
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <Text style={styles.title}>Select City</Text>
        <TouchableOpacity onPress={handleClose} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search cities..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoFocus
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, index) => `${item.name}-${item.stateCode}-${index}`}
        renderItem={renderCity}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </BottomSheet>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.base,
    },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      ...Typography.subheading,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      paddingHorizontal: Spacing.base,
      height: 44,
      marginBottom: Spacing.base,
      gap: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    list: {
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.base,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: Spacing.sm,
    },
    rowText: {
      flex: 1,
      ...Typography.body,
      color: colors.textPrimary,
    },
    regionText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
  });
}
