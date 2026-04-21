import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { FontFamily, Spacing, BorderRadius, type ProColorTokens } from '@/constants/theme';
import type { HubCollection } from '@/components/hub/hubTheme';

interface Props {
  visible: boolean;
  collections: HubCollection[];
  renamingColId: string | null;
  renameText: string;
  onRenameTextChange: (text: string) => void;
  onStartRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
  onSelectCollection: (id: string) => void;
  onNewCollection: () => void;
  onClose: () => void;
  P: ProColorTokens;
}

export function ManageCollectionsSheet({
  visible,
  collections,
  renamingColId,
  renameText,
  onRenameTextChange,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onDelete,
  onSelectCollection,
  onNewCollection,
  onClose,
  P,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={P.gradientBottom}
      handleColor={P.secondary}
      useModal
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: P.textPrimary }]}>Collections</Text>
        <TouchableOpacity hitSlop={8} onPress={onNewCollection}>
          <Ionicons name="add" size={22} color={P.primary} />
        </TouchableOpacity>
      </View>

      {collections.length === 0 ? (
        <Text style={[styles.emptyText, { color: P.textSecondary }]}>
          No collections yet. Tap + to create one.
        </Text>
      ) : (
        collections.map(col => (
          <View key={col.id} style={[styles.row, { borderBottomColor: P.border }]}>
            {renamingColId === col.id ? (
              <>
                <TextInput
                  style={[styles.input, { flex: 1, color: P.textPrimary, borderColor: P.primary, backgroundColor: P.surfaceElevated }]}
                  value={renameText}
                  onChangeText={onRenameTextChange}
                  autoFocus
                  selectTextOnFocus
                  maxLength={40}
                  underlineColorAndroid="transparent"
                />
                <TouchableOpacity hitSlop={8} onPress={() => onConfirmRename(col.id, renameText)}>
                  <Ionicons name="checkmark" size={20} color={P.primary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={onCancelRename}>
                  <Ionicons name="close" size={20} color={P.textSecondary} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => onSelectCollection(col.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.colName, { color: P.textPrimary }]}>{col.name}</Text>
                  <Text style={[styles.colCount, { color: P.textSecondary }]}>
                    {col.listingCount} listing{col.listingCount !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={() => onStartRename(col.id, col.name)}>
                  <Ionicons name="pencil-outline" size={17} color={P.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={8} onPress={() => onDelete(col.id, col.name)}>
                  <Ionicons name="trash-outline" size={17} color={P.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colName: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
  },
  colCount: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 1,
  },
  input: {
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },
});
