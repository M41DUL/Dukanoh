import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, FontFamily, Spacing } from '@/constants/theme';
import type { TaxStatus } from '@/hooks/useTaxStatus';

interface Props {
  taxStatus: TaxStatus | null;
}

export function TaxHoldBanner({ taxStatus }: Props) {
  const [warningDismissed, setWarningDismissed] = useState(false);

  if (!taxStatus || taxStatus.hasTin) return null;

  const hardBlock = taxStatus.taxHold || taxStatus.yearCount >= 29 || taxStatus.yearSales >= 1690;
  const warning = !hardBlock && (taxStatus.yearCount >= 25 || taxStatus.yearSales >= 1500);

  if (hardBlock) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.hard]}
        onPress={() => router.push('/tax-info')}
        activeOpacity={0.85}
      >
        <Ionicons name="alert-circle" size={18} color="#fff" />
        <View style={styles.textWrap}>
          <Text style={styles.hardTitle}>Tax details required</Text>
          <Text style={styles.hardBody}>
            Your listings are hidden until you add your tax details. Tap to complete.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    );
  }

  if (warning && !warningDismissed) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.warn]}
        onPress={() => router.push('/tax-info')}
        activeOpacity={0.85}
      >
        <Ionicons name="information-circle" size={18} color="#92400E" />
        <View style={styles.textWrap}>
          <Text style={styles.warnTitle}>Approaching tax threshold</Text>
          <Text style={styles.warnBody}>
            Add your tax details now to avoid disruption to your listings.
          </Text>
        </View>
        <TouchableOpacity onPress={() => setWarningDismissed(true)} hitSlop={8}>
          <Ionicons name="close" size={16} color="#92400E" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.medium,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  hard: {
    backgroundColor: '#DC2626',
  },
  warn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  textWrap: { flex: 1 },
  hardTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: '#fff',
    marginBottom: 2,
  },
  hardBody: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
  },
  warnTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: '#92400E',
    marginBottom: 2,
  },
  warnBody: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
});
