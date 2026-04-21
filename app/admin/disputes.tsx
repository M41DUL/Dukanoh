import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { edgeFetch } from '@/lib/edgeFetch';

type ResolutionOutcome = 'release_seller' | 'refund_buyer';

interface DisputedOrder {
  id: string;
  item_price: number;
  protection_fee: number;
  dispute_reason: string | null;
  dispute_description: string | null;
  disputed_at: string | null;
  created_at: string;
  listing_id: string | null;
  seller_id: string;
  buyer_id: string;
  appeal_reason: string | null;
  appeal_by: string | null;
  appealed_at: string | null;
  listing: { title: string; images: string[] } | null;
  buyer: { username: string } | null;
  seller: { username: string } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDisputesScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [disputes, setDisputes] = useState<DisputedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  // Resolve modal state
  const [modalOrder, setModalOrder] = useState<DisputedOrder | null>(null);
  const [outcome, setOutcome] = useState<ResolutionOutcome>('release_seller');
  const [note, setNote] = useState('');

  const checkAdminAndLoad = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'admin_user_ids')
      .single();

    const adminIds: string[] = JSON.parse(setting?.value ?? '[]');
    if (!adminIds.includes(user.id)) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);

    const { data } = await supabase
      .from('orders')
      .select(`
        id, item_price, protection_fee, dispute_reason, dispute_description,
        disputed_at, created_at, listing_id, seller_id, buyer_id,
        appeal_reason, appeal_by, appealed_at,
        listing:listings(title, images),
        buyer:users!orders_buyer_id_fkey(username),
        seller:users!orders_seller_id_fkey(username)
      `)
      .eq('status', 'disputed')
      .order('disputed_at', { ascending: true });

    setDisputes((data ?? []) as unknown as DisputedOrder[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { checkAdminAndLoad(); }, [checkAdminAndLoad]));

  const openResolveModal = (order: DisputedOrder) => {
    setModalOrder(order);
    setOutcome('release_seller');
    setNote('');
  };

  const handleResolve = async () => {
    if (!modalOrder) return;
    if (!note.trim()) {
      Alert.alert('Resolution note required', 'Add a note explaining the decision. This is shown to both parties.');
      return;
    }

    setResolving(true);
    const now = new Date().toISOString();
    const appealDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (outcome === 'refund_buyer') {
      // Refund fires immediately; seller can appeal but financial reversal requires manual admin action
      const refundRes = await edgeFetch('stripe-refund', { order_id: modalOrder.id });
      if (!refundRes.ok) {
        const err = await refundRes.json().catch(() => ({}));
        setResolving(false);
        Alert.alert('Refund failed', err?.error ?? 'Could not process refund. Please try again.');
        return;
      }

      await supabase
        .from('orders')
        .update({
          status: 'resolved',
          resolution_outcome: 'refund_buyer',
          resolution_note: note.trim(),
          resolved_at: now,
          appeal_deadline_at: appealDeadline,
        })
        .eq('id', modalOrder.id)
        .eq('status', 'disputed');

      if (modalOrder.listing_id) {
        await supabase
          .from('listings')
          .update({ status: 'available', buyer_id: null, sold_at: null })
          .eq('id', modalOrder.listing_id);
      }
    } else {
      // Seller wins — wallet credit deferred until appeal window closes (auto_release_orders handles it)
      await supabase
        .from('orders')
        .update({
          status: 'resolved',
          resolution_outcome: 'release_seller',
          resolution_note: note.trim(),
          resolved_at: now,
          appeal_deadline_at: appealDeadline,
        })
        .eq('id', modalOrder.id)
        .eq('status', 'disputed');
    }

    setResolving(false);
    setModalOrder(null);
    checkAdminAndLoad();
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Disputes" showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (isAdmin === false) {
    return (
      <ScreenWrapper>
        <Header title="Disputes" showBack />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textSecondary} />
          <Text style={[styles.accessDenied, { color: colors.textSecondary }]}>Admin access required</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title={`Disputes (${disputes.length})`} showBack />
      <FlatList
        data={disputes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* Item row */}
            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => router.push(`/order/${item.id}`)}
              activeOpacity={0.7}
            >
              {item.listing?.images?.[0] ? (
                <Image
                  source={{ uri: getImageUrl(item.listing.images[0], 'thumbnail') }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} />
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {item.listing?.title ?? 'Listing removed'}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  @{item.buyer?.username} → @{item.seller?.username}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  £{item.item_price.toFixed(2)} · {item.disputed_at ? formatDate(item.disputed_at) : '—'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Appeal badge */}
            {item.appealed_at && (
              <View style={[styles.appealBadge, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}40` }]}>
                <Ionicons name="refresh-circle-outline" size={14} color={colors.primary} />
                <Text style={[styles.appealBadgeText, { color: colors.primary }]}>
                  Appeal — {item.appeal_by === 'buyer' ? `@${item.buyer?.username}` : `@${item.seller?.username}`}
                </Text>
              </View>
            )}

            {/* Reason + description */}
            {item.dispute_reason && (
              <View style={[styles.reasonPill, { backgroundColor: `${colors.error}14` }]}>
                <Text style={[styles.reasonText, { color: colors.error }]}>{item.dispute_reason}</Text>
              </View>
            )}
            {item.dispute_description && (
              <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
                {item.dispute_description}
              </Text>
            )}

            {/* Appeal reason */}
            {item.appeal_reason && (
              <View style={[styles.appealReason, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={[styles.appealReasonLabel, { color: colors.textSecondary }]}>Appeal reason</Text>
                <Text style={[styles.description, { color: colors.textPrimary }]} numberOfLines={4}>
                  {item.appeal_reason}
                </Text>
              </View>
            )}

            {/* Resolve button */}
            <Button
              label="Resolve dispute"
              variant="outline"
              onPress={() => openResolveModal(item)}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            heading="No open disputes"
            subtext="All disputes have been resolved."
          />
        }
      />

      {/* Resolve modal */}
      <Modal
        visible={!!modalOrder}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOrder(null)}
      >
        <KeyboardAvoidingView
          style={[styles.modalWrap, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Resolve dispute</Text>
            <TouchableOpacity onPress={() => setModalOrder(null)} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Decision</Text>
            {([
              { value: 'release_seller', label: 'Seller wins', sub: 'Payment released to seller after 7-day appeal window', icon: 'checkmark-circle-outline', color: colors.success },
              { value: 'refund_buyer',   label: 'Buyer wins',  sub: 'Stripe refund issued immediately to buyer',              icon: 'arrow-undo-outline',     color: colors.error },
            ] as const).map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.outcomeOption,
                  { borderColor: outcome === opt.value ? opt.color : colors.border, backgroundColor: colors.surface },
                  outcome === opt.value && { backgroundColor: `${opt.color}10` },
                ]}
                onPress={() => setOutcome(opt.value)}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.icon} size={20} color={outcome === opt.value ? opt.color : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.outcomeLabel, { color: outcome === opt.value ? opt.color : colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.outcomeSub, { color: colors.textSecondary }]}>{opt.sub}</Text>
                </View>
                <View style={[
                  styles.radio,
                  { borderColor: outcome === opt.value ? opt.color : colors.border },
                  outcome === opt.value && { backgroundColor: opt.color },
                ]}>
                  {outcome === opt.value && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: Spacing.lg }]}>
              Resolution note
            </Text>
            <Text style={[styles.noteHint, { color: colors.textSecondary }]}>
              Shown to both buyer and seller. Explain the decision clearly.
            </Text>
            <View style={[styles.textAreaWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary }]}
                placeholder="e.g. Based on the evidence provided, the item was not as described in the listing. A refund has been issued."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={5}
                value={note}
                onChangeText={t => setNote(t.slice(0, 600))}
                maxLength={600}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textSecondary }]}>{note.length}/600</Text>

            <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Both parties have 7 days to appeal this decision. Seller payment is held until the appeal window closes.
              </Text>
            </View>

            <Button
              label={resolving ? 'Resolving…' : `Confirm — ${outcome === 'release_seller' ? 'Seller wins' : 'Buyer wins'}`}
              onPress={handleResolve}
              loading={resolving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    list: {
      flexGrow: 1,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    card: {
      borderRadius: BorderRadius.large,
      padding: Spacing.base,
      gap: Spacing.md,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    thumb: {
      width: 56,
      height: 70,
      borderRadius: BorderRadius.medium,
      flexShrink: 0,
    },
    itemInfo: {
      flex: 1,
      gap: 3,
    },
    itemTitle: {
      fontSize: 13,
      fontFamily: FontFamily.medium,
      lineHeight: 18,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
    },
    appealBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    appealBadgeText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
    },
    reasonPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    reasonText: {
      fontSize: 12,
      fontFamily: FontFamily.semibold,
    },
    description: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
    appealReason: {
      borderRadius: BorderRadius.medium,
      borderWidth: 1,
      padding: Spacing.md,
      gap: 4,
    },
    appealReasonLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    accessDenied: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
    },
    // Modal
    modalWrap: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.base,
      borderBottomWidth: 1,
    },
    modalTitle: {
      fontSize: 17,
      fontFamily: FontFamily.semibold,
    },
    modalScroll: { flex: 1 },
    modalContent: {
      padding: Spacing.base,
      gap: Spacing.md,
      paddingBottom: Spacing['3xl'],
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    outcomeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderWidth: 1.5,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    outcomeLabel: {
      fontSize: 14,
      fontFamily: FontFamily.semibold,
      marginBottom: 2,
    },
    outcomeSub: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      lineHeight: 16,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#fff',
    },
    noteHint: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
      marginTop: -Spacing.xs,
    },
    textAreaWrap: {
      borderRadius: BorderRadius.medium,
      borderWidth: 1.5,
      padding: Spacing.base,
      minHeight: 120,
    },
    textArea: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      lineHeight: 22,
      minHeight: 100,
    },
    charCount: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      textAlign: 'right',
      marginTop: -Spacing.xs,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
  });
}
