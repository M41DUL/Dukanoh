import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { pickEvidencePhotos } from '@/lib/disputeEvidence';

interface Props {
  label: string;
  hint?: string;
  uris: string[];
  onChange: (uris: string[]) => void;
  max: number;
}

const TILE = 84;

/** Local photo grid used by the dispute and appeal forms before upload. */
export function EvidencePicker({ label, hint, uris, onChange, max }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const remaining = max - uris.length;

  const add = async () => {
    const picked = await pickEvidencePhotos(remaining);
    if (picked.length > 0) onChange([...uris, ...picked]);
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.grid}>
        {uris.map((uri, i) => (
          <View key={`${uri}-${i}`} style={styles.tile}>
            <Image source={{ uri }} style={styles.img} contentFit="cover" />
            <TouchableOpacity
              style={[styles.remove, { backgroundColor: colors.textPrimary }]}
              onPress={() => onChange(uris.filter((_, j) => j !== i))}
              hitSlop={8}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={12} color={colors.background} />
            </TouchableOpacity>
          </View>
        ))}
        {remaining > 0 && (
          <TouchableOpacity style={styles.addTile} onPress={add} activeOpacity={0.7} accessibilityLabel="Add photo">
            <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.addText}>Add photo</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.count}>{uris.length}/{max}</Text>
    </View>
  );
}

const getStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    label: { fontSize: 13, color: colors.textSecondary, marginBottom: 4, ...FontFamily.medium },
    hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: Spacing.sm, ...FontFamily.regular },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    tile: { width: TILE, height: TILE, borderRadius: BorderRadius.medium, overflow: 'visible' },
    img: { width: TILE, height: TILE, borderRadius: BorderRadius.medium, backgroundColor: colors.surface },
    remove: {
      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    addTile: {
      width: TILE, height: TILE, borderRadius: BorderRadius.medium, borderWidth: 1, borderStyle: 'dashed',
      borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    addText: { fontSize: 11, color: colors.textSecondary, ...FontFamily.medium },
    count: { fontSize: 11, color: colors.textSecondary, marginTop: 6, textAlign: 'right', ...FontFamily.regular },
  });
