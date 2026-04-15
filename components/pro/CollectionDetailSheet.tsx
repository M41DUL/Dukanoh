import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { getImageUrl } from '@/lib/imageUtils';
import { FontFamily, Spacing, BorderRadius, type ProColorTokens } from '@/constants/theme';
import type { HubListing, HubCollection } from '@/components/hub/hubTheme';

interface Props {
  visible: boolean;
  collection: HubCollection | null;
  inCollection: HubListing[];
  notInCollection: HubListing[];
  onClose: () => void;
  onAssign: (listingId: string, collectionId: string | null) => void;
  P: ProColorTokens;
}

// ── Row sub-component ────────────────────────────────────────

interface RowProps {
  listing: HubListing;
  mode: 'remove' | 'add';
  collectionId: string | null;
  onAssign: (listingId: string, collectionId: string | null) => void;
  P: ProColorTokens;
}

function ColDetailRow({ listing, mode, collectionId, onAssign, P }: RowProps) {
  return (
    <TouchableOpacity
      style={[rowStyles.row, { borderBottomColor: P.border }]}
      onPress={() => onAssign(listing.id, mode === 'remove' ? null : collectionId)}
      activeOpacity={0.75}
    >
      {listing.images?.[0] ? (
        <Image
          source={{ uri: getImageUrl(listing.images[0], 'thumbnail') }}
          style={rowStyles.thumb}
        />
      ) : (
        <View style={[rowStyles.thumb, { backgroundColor: P.surfaceElevated }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.name, { color: P.textPrimary }]} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={[rowStyles.price, { color: P.textSecondary }]}>
          £{listing.price.toFixed(2)}
        </Text>
      </View>
      <Ionicons
        name={mode === 'remove' ? 'remove-circle-outline' : 'add-circle-outline'}
        size={22}
        color={mode === 'remove' ? P.error : P.primary}
      />
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.medium,
    overflow: 'hidden',
  },
  name: {
    fontSize: 14,
    fontFamily: FontFamily.medium,
  },
  price: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
});

// ── Sheet ────────────────────────────────────────────────────

export function CollectionDetailSheet({
  visible,
  collection,
  inCollection,
  notInCollection,
  onClose,
  onAssign,
  P,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={P.gradientBottom}
      handleColor={P.secondary}
      fullScreen
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: P.surfaceElevated }]}
        >
          <Ionicons name="arrow-back" size={18} color={P.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: P.textPrimary }]}>{collection?.name ?? ''}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {inCollection.length === 0 && notInCollection.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: P.textSecondary }]}>
              No active listings yet.
            </Text>
          </View>
        ) : (
          <>
            {inCollection.length > 0 && (
              <>
                <Text style={[styles.section, { color: P.textSecondary }]}>
                  In this collection
                </Text>
                {inCollection.map(l => (
                  <ColDetailRow
                    key={l.id}
                    listing={l}
                    mode="remove"
                    collectionId={collection?.id ?? null}
                    onAssign={onAssign}
                    P={P}
                  />
                ))}
              </>
            )}

            {notInCollection.length > 0 && (
              <>
                <Text style={[styles.section, { color: P.textSecondary }]}>
                  Add listings
                </Text>
                {notInCollection.map(l => (
                  <ColDetailRow
                    key={l.id}
                    listing={l}
                    mode="add"
                    collectionId={collection?.id ?? null}
                    onAssign={onAssign}
                    P={P}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: FontFamily.semibold,
  },
  section: {
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  empty: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
  },
});
