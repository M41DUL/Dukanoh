import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Alert,
  FlatList,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { activeConversationId } from '@/hooks/usePushNotifications';
import { BottomBar } from '@/components/BottomBar';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useSendMessage, useMarkConversationRead } from '@/lib/mutations';
import { useAuth } from '@/hooks/useAuth';
import { getImageUrl } from '@/lib/imageUtils';
import { formatGBP } from '@/lib/paymentHelpers';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
}

interface ConversationMeta {
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  other_username: string;
  other_is_deleted: boolean;
  is_buyer: boolean;
  // Listing snapshot. `listing_exists` is false when the listing row was
  // deleted (the FK join comes back null) — never trust listing_status alone.
  listing_exists: boolean;
  listing_title: string;
  listing_status: string;
  listing_price: number | null;
  listing_image: string | null;
  listing_image_count: number;
  listing_category: string | null;
  listing_condition: string | null;
  listing_occasion: string | null;
  listing_measurements: Record<string, unknown> | null;
  // True only when the buyer can actually purchase: listing exists, is
  // available, and the seller is not under a tax hold.
  can_buy: boolean;
}

// Raw shape returned by the conversations query (with joined rows
// nested by Supabase's foreign-key select syntax). Flattened into
// ConversationMeta in a useMemo below.
interface ConversationRow {
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_sender_id: string | null;
  buyer: { username: string | null; deleted_at: string | null } | null;
  seller: { username: string | null; deleted_at: string | null; tax_hold: boolean | null } | null;
  listing: {
    title: string | null;
    status: string | null;
    price: number | null;
    images: string[] | null;
    category: string | null;
    condition: string | null;
    occasion: string | null;
    measurements: Record<string, unknown> | null;
  } | null;
}

const PAGE_SIZE = 40;

// A measurements object counts as "filled" only if at least one field has a
// real value — sellers can leave it as an empty/all-null object.
function hasMeasurements(m: Record<string, unknown> | null): boolean {
  if (!m) return false;
  return Object.values(m).some(v => v !== null && v !== undefined && String(v).trim() !== '');
}

// Occasions where delivery timing matters enough to prompt the buyer to ask.
const TIME_SENSITIVE_OCCASIONS = ['Wedding', 'Festive', 'Partywear'];

// Legacy protocol messages from the removed bidding feature. Any that linger in
// old threads are hidden so they never render as raw "__OFFER__:40" text.
const OFFER_PREFIXES = ['__OFFER__:', '__OFFER_ACCEPTED__:', '__OFFER_DECLINED__:'];
const isOfferProtocol = (content: string) => OFFER_PREFIXES.some(p => content.startsWith(p));

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();

  // Suppress push notifications for this conversation while screen is open
  useEffect(() => {
    activeConversationId.current = id ?? null;
    return () => { activeConversationId.current = null; };
  }, [id]);

  const metaQuery = useQuery({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: async ({ signal }): Promise<ConversationRow> => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          listing_id, buyer_id, seller_id, last_message_sender_id,
          buyer:users!conversations_buyer_id_fkey ( username, deleted_at ),
          seller:users!conversations_seller_id_fkey ( username, deleted_at, tax_hold ),
          listing:listings!conversations_listing_id_fkey ( title, status, price, images, category, condition, occasion, measurements )
        `)
        .eq('id', id!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Conversation not found');
      return data as ConversationRow;
    },
    enabled: !!id && !!user,
  });

  const meta = useMemo<ConversationMeta | null>(() => {
    const c = metaQuery.data;
    if (!c || !user) return null;
    const isBuyer = c.buyer_id === user.id;
    const otherParty = isBuyer ? c.seller : c.buyer;
    const listingExists = !!c.listing;
    const status = c.listing?.status ?? 'unavailable';
    const images = c.listing?.images ?? [];
    return {
      listing_id: c.listing_id,
      buyer_id: c.buyer_id,
      seller_id: c.seller_id,
      other_username:    otherParty?.username ?? '',
      other_is_deleted:  !!otherParty?.deleted_at,
      is_buyer: isBuyer,
      listing_exists: listingExists,
      listing_title: c.listing?.title ?? '',
      listing_status: status,
      listing_price: c.listing?.price ?? null,
      listing_image: images[0] ?? null,
      listing_image_count: images.length,
      listing_category: c.listing?.category ?? null,
      listing_condition: c.listing?.condition ?? null,
      listing_occasion: c.listing?.occasion ?? null,
      listing_measurements: c.listing?.measurements ?? null,
      can_buy: isBuyer && listingExists && status === 'available' && !c.seller?.tax_hold,
    };
  }, [metaQuery.data, user]);

  // Keep the listing snapshot honest: if the item sells or is pulled while the
  // buyer has this thread open, refetch on focus so the Buy Now bar can't go stale.
  const refetchMeta = metaQuery.refetch;
  useFocusEffect(
    React.useCallback(() => {
      refetchMeta();
    }, [refetchMeta])
  );

  // Mark as read on initial load when the last message was from the other person.
  // Reads `last_message_sender_id` directly off metaQuery.data (the raw row),
  // not the mapped `meta`, since meta drops that field.
  useEffect(() => {
    const c = metaQuery.data;
    if (!c || !user || !id) return;
    if (c.last_message_sender_id && c.last_message_sender_id !== user.id) {
      markRead.mutate({ conversationId: id });
    }
    // Intentionally only depends on the cached row + user — markRead identity
    // is stable enough that re-firing on its change isn't useful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaQuery.data, user, id]);

  const messagesQuery = useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(id),
    queryFn: async ({ pageParam, signal }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, sender_id, created_at')
        .eq('conversation_id', id!)
        .order('created_at', { ascending: false })
        .range(from, to)
        .abortSignal(signal);
      if (error) throw error;
      return {
        data: (data ?? []) as Message[],
        nextCursor: (data?.length ?? 0) === PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!id && !!user,
  });

  const messages = useMemo<Message[]>(
    () => (messagesQuery.data?.pages.flatMap(p => p.data) ?? []).filter(m => !isOfferProtocol(m.content)),
    [messagesQuery.data],
  );

  // Gap-driven prompts shown to the buyer only, and only early in a thread on a
  // buyable listing. Each chip surfaces a question the listing doesn't already
  // answer; chips the buyer has already sent are dropped, capped at 4.
  const suggestedQuestions = useMemo<string[]>(() => {
    if (!meta || !meta.is_buyer || !meta.can_buy) return [];
    if (messages.length >= 6) return [];
    const asked = new Set(messages.map(m => m.content.trim().toLowerCase()));

    const candidates: string[] = [];
    if (!hasMeasurements(meta.listing_measurements)) candidates.push('What are the measurements?');
    if (meta.listing_image_count <= 1) candidates.push('Can you send more photos?');
    if (meta.listing_condition && !/^new/i.test(meta.listing_condition)) candidates.push('Any flaws or damage?');
    if (meta.listing_category === 'Shoes') candidates.push('Is it true to size?');
    if (meta.listing_occasion && TIME_SENSITIVE_OCCASIONS.includes(meta.listing_occasion)) candidates.push('Will it arrive in time?');
    if (meta.listing_occasion === 'Wedding') candidates.push('Is this authentic?');
    candidates.push('Is this still available?'); // always-available fallback, last

    const out: string[] = [];
    const seen = new Set<string>();
    for (const q of candidates) {
      const key = q.toLowerCase();
      if (seen.has(key) || asked.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= 4) break;
    }
    return out;
  }, [meta, messages]);

  // Realtime: any new message in this thread invalidates the messages cache so
  // it refetches. Realtime payload row shape may drift from the SELECT shape
  // above, so invalidate-and-refetch is safer than setQueryData.
  useEffect(() => {
    if (!id || !user) return;

    const channel = supabase
      .channel(`conversation:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        payload => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations.messages(id) });
          // Mark as read immediately if the message is from the other party
          // (the user is viewing the conversation, so it counts as read).
          const msg = payload.new as Message;
          if (msg.sender_id !== user.id) {
            markRead.mutate({ conversationId: id });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, queryClient]);

  const handleSend = () => {
    if (!text.trim() || sendMessage.isPending || !user || !id || !meta) return;
    const content = text.trim();
    setText('');
    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;
    sendMessage.mutate(
      {
        conversationId: id,
        listingId: meta.listing_id,
        senderId: user.id,
        receiverId,
        content,
      },
      {
        onError: () => {
          setText(content); // Restore text so user can retry
          Alert.alert('Error', 'Failed to send message. Please try again.');
        },
      }
    );
  };

  const sendQuickQuestion = (question: string) => {
    if (sendMessage.isPending || !user || !id || !meta) return;
    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;
    sendMessage.mutate(
      {
        conversationId: id,
        listingId: meta.listing_id,
        senderId: user.id,
        receiverId,
        content: question,
      },
      {
        onError: () => Alert.alert('Error', 'Could not send. Please try again.'),
      }
    );
  };

  const loadMore = () => {
    if (messagesQuery.isFetchingNextPage || !messagesQuery.hasNextPage) return;
    messagesQuery.fetchNextPage();
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getDateKey = (dateStr: string) => new Date(dateStr).toDateString();

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.sender_id === user?.id;

    // In an inverted list, the next item is older. Show a date label
    // when this message is the first of its day (i.e. the next item is a different day or doesn't exist).
    const nextItem = messages[index + 1];
    const showDate = !nextItem || getDateKey(item.created_at) !== getDateKey(nextItem.created_at);

    const bubble = (
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
          {item.content}
        </Text>
      </View>
    );

    return (
      <>
        {bubble}
        {showDate && (
          <View style={styles.dateLabel}>
            <Text style={styles.dateLabelText}>{formatDateLabel(item.created_at)}</Text>
          </View>
        )}
      </>
    );
  };

  const initialLoading = metaQuery.isLoading || messagesQuery.isLoading;

  if (initialLoading) {
    return (
      <ScreenWrapper>
        <Header showBack title="Message" />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (metaQuery.isError || !meta) {
    return (
      <ScreenWrapper>
        <Header showBack title="Message" />
        <View style={styles.emptyList}>
          <View style={styles.emptyWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Could not load this conversation</Text>
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header
        showBack
        title={
          meta.other_is_deleted
            ? 'Deleted member'
            : meta.other_username
              ? `@${meta.other_username}`
              : 'Message'
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {!meta.listing_exists ? (
          <View style={styles.itemBar}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.itemUnavailable}>Listing no longer available</Text>
          </View>
        ) : (
          <View style={styles.itemBar}>
            <TouchableOpacity
              style={styles.itemInfo}
              onPress={() => router.push(`/listing/${meta.listing_id}`)}
              activeOpacity={0.7}
            >
              {meta.listing_image ? (
                <Image
                  source={{ uri: getImageUrl(meta.listing_image, 'thumbnail') }}
                  style={styles.itemThumb}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                  <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.itemText}>
                <Text style={styles.itemTitle} numberOfLines={1}>{meta.listing_title || 'Listing'}</Text>
                {meta.listing_price != null && (
                  <Text style={styles.itemPrice}>{formatGBP(meta.listing_price)}</Text>
                )}
              </View>
            </TouchableOpacity>

            {meta.can_buy ? (
              <View style={styles.buyCol}>
                <TouchableOpacity
                  style={styles.buyBtn}
                  onPress={() => router.push(`/checkout/${meta.listing_id}`)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buyBtnText}>Buy now</Text>
                </TouchableOpacity>
                <View style={styles.protectedRow}>
                  <Ionicons name="shield-checkmark" size={11} color={colors.success} />
                  <Text style={styles.protectedText}>Includes Safe Checkout</Text>
                </View>
              </View>
            ) : meta.listing_status === 'sold' ? (
              <View style={styles.statusTag}><Text style={styles.statusTagText}>Sold</Text></View>
            ) : meta.is_buyer ? (
              <View style={styles.statusTag}><Text style={styles.statusTagText}>Unavailable</Text></View>
            ) : null}
          </View>
        )}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={[styles.messageList, messages.length === 0 && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews
          ListFooterComponent={messagesQuery.isFetchingNextPage ? <LoadingSpinner /> : null}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Send a message to start the conversation</Text>
            </View>
          }
        />

        {suggestedQuestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
          >
            {suggestedQuestions.map(q => (
              <TouchableOpacity
                key={q}
                style={styles.chip}
                onPress={() => sendQuickQuestion(q)}
                disabled={sendMessage.isPending}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {meta.listing_status === 'sold' ? (
          <BottomBar style={{ justifyContent: 'center' }}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.soldInputText}>This listing has been sold</Text>
          </BottomBar>
        ) : (
          <BottomBar style={{ alignItems: 'flex-end' }}>
            <Input
              placeholder="Message…"
              value={text}
              onChangeText={setText}
              containerStyle={styles.inputContainer}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!text.trim() || sendMessage.isPending) && styles.sendDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sendMessage.isPending}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={20} color={colors.background} />
            </TouchableOpacity>
          </BottomBar>
        )}
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    itemBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      marginTop: Spacing.sm,
      marginBottom: Spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
    },
    itemInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    itemThumb: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.small,
      backgroundColor: colors.border,
    },
    itemThumbEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemText: {
      flex: 1,
      gap: 2,
    },
    itemTitle: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    itemPrice: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_700Bold',
    },
    itemUnavailable: {
      ...Typography.caption,
      color: colors.textSecondary,
      fontFamily: 'Inter_500Medium',
    },
    buyCol: {
      alignItems: 'center',
      gap: 3,
    },
    buyBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    buyBtnText: {
      ...Typography.caption,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
    },
    protectedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    protectedText: {
      ...Typography.caption,
      fontSize: 10,
      color: colors.textSecondary,
      fontFamily: 'Inter_500Medium',
    },
    statusTag: {
      backgroundColor: colors.error,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.small,
    },
    statusTagText: {
      ...Typography.caption,
      fontSize: 10,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
    },
    chipsScroll: {
      flexGrow: 0,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    chip: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    chipText: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },
    messageList: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
    },
    emptyList: {
      flex: 1,
      justifyContent: 'center',
    },
    emptyWrap: {
      alignItems: 'center',
      gap: Spacing.sm,
      transform: Platform.OS === 'android' ? [{ scaleX: -1 }, { scaleY: -1 }] : [{ scaleY: -1 }],
    },
    emptyText: {
      ...Typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    dateLabel: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    dateLabelText: {
      ...Typography.caption,
      color: colors.textSecondary,
      fontSize: 11,
    },
    bubble: {
      maxWidth: '78%',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.large,
    },
    bubbleOwn: {
      backgroundColor: colors.primary,
      alignSelf: 'flex-end',
      borderBottomRightRadius: BorderRadius.small,
    },
    bubbleOther: {
      backgroundColor: colors.surface,
      alignSelf: 'flex-start',
      borderBottomLeftRadius: BorderRadius.small,
    },
    bubbleText: { ...Typography.body, color: colors.textPrimary },
    bubbleTextOwn: { color: '#FFFFFF' },
    inputContainer: { flex: 1 },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.4 },
    soldInputText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
  });
}
