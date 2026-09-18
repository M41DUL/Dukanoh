import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchDisputeEvidence,
  pickEvidencePhotos,
  uploadDisputeEvidence,
  MAX_DISPUTE_PHOTOS,
  type EvidenceStage,
} from '@/lib/disputeEvidence';

interface Props {
  orderId: string;
  buyerId: string | null;
  /** Parties may add photos while the dispute is open (Terms 13.1). */
  canAdd: boolean;
  stage: EvidenceStage;
}

const TILE = 72;

/**
 * Evidence already attached to an order, from both parties, plus an "Add photos"
 * action while the dispute is open. Shown inside the dispute and resolved cards
 * on the order screen.
 */
export function DisputeEvidenceStrip({ orderId, buyerId, canAdd, stage }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const queryKey = ['dispute-evidence', orderId];
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchDisputeEvidence(orderId),
    staleTime: 30_000,
  });

  const mine = items.filter(i => i.user_id === user?.id).length;
  const remaining = Math.max(0, MAX_DISPUTE_PHOTOS - mine);

  const handleAdd = async () => {
    if (!user) return;
    const uris = await pickEvidencePhotos(remaining);
    if (uris.length === 0) return;
    setAdding(true);
    try {
      await uploadDisputeEvidence({ orderId, userId: user.id, uris, stage });
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      Alert.alert('Upload failed', 'Your photos could not be added. Check your connection and try again.');
    } finally {
      setAdding(false);
    }
  };

  if (!isLoading && items.length === 0 && !canAdd) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>Evidence</Text>
        {canAdd && remaining > 0 && (
          <TouchableOpacity onPress={handleAdd} disabled={adding} activeOpacity={0.7} style={styles.addBtn}>
            {adding
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="camera-outline" size={14} color={colors.primary} />}
            <Text style={[styles.addText, { color: colors.primary }]}>{adding ? 'Adding…' : 'Add photos'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>
          {canAdd ? 'No photos yet. Photos of the piece, the label and any damage help our team decide.' : 'No photos were added.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {items.map(item => (
            <View key={item.id} style={styles.tile}>
              {item.url
                ? <Image source={{ uri: item.url }} style={styles.img} contentFit="cover" />
                : <View style={[styles.img, styles.imgFallback]} />}
              <Text style={styles.caption} numberOfLines={1}>
                {item.user_id === buyerId ? 'Buyer' : 'Seller'}{item.stage === 'appeal' ? ' · appeal' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrap: { marginTop: Spacing.sm, gap: Spacing.xs },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textSecondary, ...FontFamily.semibold },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    addText: { fontSize: 13, ...FontFamily.semibold },
    empty: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, ...FontFamily.regular },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    tile: { width: TILE },
    img: { width: TILE, height: TILE, borderRadius: BorderRadius.medium, backgroundColor: colors.surface },
    imgFallback: { borderWidth: 1, borderColor: colors.border },
    caption: { fontSize: 11, color: colors.textSecondary, marginTop: 3, ...FontFamily.regular },
  });
