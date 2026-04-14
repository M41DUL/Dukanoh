import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { FontFamily, Spacing, BorderRadius, type ProColorTokens } from '@/constants/theme';
import type { HubListing } from '@/components/hub/hubTheme';

const BULK_PRESETS = [
  { label: '−5%',  value: 0.05 },
  { label: '−10%', value: 0.10 },
  { label: '−15%', value: 0.15 },
  { label: '−20%', value: 0.20 },
];

interface Props {
  visible: boolean;
  listings: HubListing[];
  onClose: () => void;
  onSaved: () => void;
  P: ProColorTokens;
}

export function BulkEditSheet({ visible, listings, onClose, onSaved, P }: Props) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const initial: Record<string, string> = {};
      listings.forEach(l => { initial[l.id] = String(l.price); });
      setPrices(initial);
    }
  }, [visible, listings]);

  const changedIds = useMemo(
    () => listings.filter(l => {
      const val = parseFloat(prices[l.id] ?? '');
      return !isNaN(val) && val !== l.price;
    }).map(l => l.id),
    [listings, prices]
  );

  const applyPreset = useCallback((reduction: number) => {
    setPrices(prev => {
      const next = { ...prev };
      listings.forEach(l => {
        const reduced = Math.max(0.01, Math.round(l.price * (1 - reduction) * 100) / 100);
        next[l.id] = String(reduced);
      });
      return next;
    });
  }, [listings]);

  const handleClose = useCallback(() => {
    if (changedIds.length > 0) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved price changes.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  }, [changedIds.length, onClose]);

  const handleSave = useCallback(async () => {
    if (changedIds.length === 0 || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        changedIds.map(id => {
          const listing = listings.find(l => l.id === id);
          if (!listing) return Promise.resolve();
          const newPrice = parseFloat(prices[id]);
          const isPriceDrop = newPrice < listing.price;
          const update: Record<string, unknown> = { price: newPrice };
          if (isPriceDrop) {
            update.original_price = listing.price;
            update.price_dropped_at = now;
          } else {
            update.original_price = null;
            update.price_dropped_at = null;
          }
          return supabase.from('listings').update(update).eq('id', id);
        })
      );
      onSaved();
    } catch {
      Alert.alert('Something went wrong', 'Could not save all price changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [changedIds, listings, prices, saving, onSaved]);

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      backgroundColor={P.surfaceElevated}
      handleColor={P.border}
      fullScreen
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={12}
            style={[styles.closeBtn, { backgroundColor: P.surface }]}
          >
            <Ionicons name="close" size={20} color={P.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.textPrimary }]}>Edit Prices</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Percentage presets */}
        <View style={styles.presetsRow}>
          {BULK_PRESETS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.preset, { backgroundColor: P.surface, borderColor: P.border }]}
              onPress={() => applyPreset(p.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.presetText, { color: P.textPrimary }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {listings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={32} color={P.textSecondary} />
            <Text style={[styles.emptyText, { color: P.textSecondary }]}>
              No active listings to edit.
            </Text>
          </View>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const currentVal = prices[item.id] ?? String(item.price);
              const parsedVal = parseFloat(currentVal);
              const changed = !isNaN(parsedVal) && parsedVal !== item.price;
              return (
                <View style={[styles.row, { borderBottomColor: P.border }]}>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowTitle, { color: P.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowOriginal, { color: P.textSecondary }]}>
                      was £{item.price.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[
                    styles.inputWrap,
                    { backgroundColor: P.surface, borderColor: changed ? P.primary : P.border },
                  ]}>
                    <Text style={[styles.inputPrefix, { color: P.textPrimary }]}>£</Text>
                    <TextInput
                      style={[styles.input, { color: P.textPrimary }]}
                      value={currentVal}
                      onChangeText={text => setPrices(prev => ({ ...prev, [item.id]: text }))}
                      keyboardType="decimal-pad"
                      placeholderTextColor={P.textSecondary}
                      underlineColorAndroid="transparent"
                      selectTextOnFocus
                    />
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: P.border }]}>
          <Button
            label={
              saving
                ? 'Saving…'
                : changedIds.length === 0
                  ? 'No changes'
                  : `Save ${changedIds.length} change${changedIds.length === 1 ? '' : 's'}`
            }
            onPress={handleSave}
            disabled={changedIds.length === 0 || saving}
            size="lg"
            backgroundColor={P.primary}
            textColor={P.ctaBtnText}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  preset: {
    flex: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },
  list: {
    paddingBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
  },
  rowOriginal: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.medium,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.sm,
    height: 40,
  },
  inputPrefix: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
  },
  input: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    minWidth: 60,
    textAlign: 'right',
  },
  footer: {
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
