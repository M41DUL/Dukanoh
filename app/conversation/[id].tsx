import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Alert,
  FlatList,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { activeConversationId } from '@/hooks/usePushNotifications';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

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
  listing_title: string;
  listing_status: string;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<FlatList>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const PAGE_SIZE = 40;

  // Suppress push notifications for this conversation while screen is open
  useEffect(() => {
    activeConversationId.current = id ?? null;
    return () => { activeConversationId.current = null; };
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;

    // Fetch conversation metadata + messages in parallel
    Promise.all([
      supabase
        .from('conversations')
        .select(`
          listing_id, buyer_id, seller_id, last_message_sender_id,
          buyer:users!conversations_buyer_id_fkey ( username ),
          seller:users!conversations_seller_id_fkey ( username ),
          listing:listings!conversations_listing_id_fkey ( title, status )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1),
    ]).then(([{ data: conv, error: convErr }, { data: msgs }]) => {
      if (convErr || !conv) {
        setLoadError(true);
        setLoading(false);
        return;
      } else {
        const c = conv as any;
        const isBuyer = c.buyer_id === user.id;
        setMeta({
          listing_id: c.listing_id,
          buyer_id: c.buyer_id,
          seller_id: c.seller_id,
          other_username: isBuyer ? c.seller?.username : c.buyer?.username,
          listing_title: c.listing?.title ?? '',
          listing_status: c.listing?.status ?? 'available',
        });
        // Mark as read if the last message was from the other person
        if (c.last_message_sender_id && c.last_message_sender_id !== user.id) {
          supabase
            .from('conversations')
            .update({ last_message_sender_id: null })
            .eq('id', id)
            .then(() => {});
        }
      }
      if (msgs) {
        setMessages(msgs as Message[]);
        setHasMore(msgs.length === PAGE_SIZE);
      }
      setLoading(false);
    });

    const channel = supabase
      .channel(`conversation:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        payload => {
          setMessages(prev => [payload.new as Message, ...prev]);
          // Mark as read immediately since the user is viewing the conversation
          const msg = payload.new as Message;
          if (msg.sender_id !== user.id) {
            supabase
              .from('conversations')
              .update({ last_message_sender_id: null })
              .eq('id', id)
              .then(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  const respondToOffer = async (offerId: string, amount: string, accepted: boolean) => {
    if (!user || !id || !meta) return;

    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;
    const content = accepted ? `__OFFER_ACCEPTED__:${offerId}:${amount}` : `__OFFER_DECLINED__:${offerId}:${amount}`;

    const { error } = await supabase.from('messages').insert({
      id: Crypto.randomUUID(),
      conversation_id: id,
      listing_id: meta.listing_id,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    });
    if (error && error.code !== '23505') {
      Alert.alert('Error', 'Failed to respond to offer. Please try again.');
    }
  };

  const handleSend = async () => {
    if (!text.trim() || sending || !user || !id || !meta) return;

    setSending(true);
    const content = text.trim();
    setText('');

    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;

    const { error } = await supabase.from('messages').insert({
      id: Crypto.randomUUID(),
      conversation_id: id,
      listing_id: meta.listing_id,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    });

    if (error && error.code !== '23505') {
      setText(content); // Restore text so user can retry
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }

    setSending(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || !id || messages.length === 0) return;
    setLoadingMore(true);
    const { data: older } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .range(messages.length, messages.length + PAGE_SIZE - 1);
    if (older) {
      setMessages(prev => [...prev, ...(older as Message[])]);
      setHasMore(older.length === PAGE_SIZE);
    }
    setLoadingMore(false);
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

    // Parse offer response content — supports both new format (with offerId) and legacy (amount only)
    const parseOfferResponse = (content: string, prefix: string) => {
      const payload = content.slice(prefix.length);
      const parts = payload.split(':');
      // New format: "offerId:amount", Legacy format: "amount"
      if (parts.length >= 2) return { offerId: parts[0], amount: parts.slice(1).join(':') };
      return { offerId: null, amount: parts[0] };
    };

    let bubble;
    if (item.content.startsWith('__OFFER_ACCEPTED__:')) {
      const { amount } = parseOfferResponse(item.content, '__OFFER_ACCEPTED__:');
      bubble = (
        <View style={[styles.offerResponseBubble, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.offerResponseText}>Offer of £{amount} accepted</Text>
        </View>
      );
    } else if (item.content.startsWith('__OFFER_DECLINED__:')) {
      const { amount } = parseOfferResponse(item.content, '__OFFER_DECLINED__:');
      bubble = (
        <View style={[styles.offerResponseBubble, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="close-circle" size={16} color={colors.error} />
          <Text style={styles.offerResponseText}>Offer of £{amount} declined</Text>
        </View>
      );
    } else if (item.content.startsWith('__OFFER__:')) {
      const amount = item.content.slice('__OFFER__:'.length);

      // Check if this specific offer has a response (by offer ID or legacy amount match)
      const hasResponse = messages.some(m => {
        if (m.content.startsWith('__OFFER_ACCEPTED__:') || m.content.startsWith('__OFFER_DECLINED__:')) {
          const prefix = m.content.startsWith('__OFFER_ACCEPTED__:') ? '__OFFER_ACCEPTED__:' : '__OFFER_DECLINED__:';
          const { offerId } = parseOfferResponse(m.content, prefix);
          // New format: match by offer ID. Legacy: fall back to amount match.
          return offerId ? offerId === item.id : m.content.endsWith(`:${amount}`) || m.content.endsWith(amount);
        }
        return false;
      });
      const canRespond = !isOwn && !hasResponse;

      bubble = (
        <View style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
          <View style={[styles.offerBubble, isOwn ? styles.offerOwn : styles.offerOther]}>
            <Ionicons name="pricetag-outline" size={14} color={isOwn ? '#FFFFFF' : colors.amber} />
            <View>
              <Text style={[styles.offerLabel, isOwn ? styles.textOnPrimary : styles.textMuted]}>Offer</Text>
              <Text style={[styles.offerAmount, isOwn ? styles.textOnPrimary : styles.textAmber]}>£{amount}</Text>
            </View>
          </View>
          {canRespond && (
            <View style={styles.offerActions}>
              <TouchableOpacity style={styles.declineBtn} onPress={() => respondToOffer(item.id, amount, false)}>
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => respondToOffer(item.id, amount, true)}>
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    } else {
      bubble = (
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
            {item.content}
          </Text>
        </View>
      );
    }

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

  if (loading) {
    return (
      <ScreenWrapper>
        <Header showBack title="Message" />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (loadError) {
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
        title={meta?.other_username ? `@${meta.other_username}` : 'Message'}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {meta?.listing_title ? (
          <TouchableOpacity
            style={styles.listingCard}
            onPress={meta ? () => router.push(`/listing/${meta.listing_id}`) : undefined}
            activeOpacity={0.7}
          >
            <Text style={styles.listingCardTitle} numberOfLines={1}>{meta.listing_title}</Text>
            {meta.listing_status === 'sold' && (
              <View style={styles.soldTag}>
                <Text style={styles.soldTagText}>Sold</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
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
          ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Send a message to start the conversation</Text>
            </View>
          }
        />

        {meta?.listing_status === 'sold' ? (
          <View style={styles.soldInputRow}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.soldInputText}>This listing has been sold</Text>
          </View>
        ) : (
          <View style={styles.inputRow}>
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
              style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up" size={20} color={colors.background} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    listingCard: {
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
    listingCardTitle: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      flex: 1,
    },
    soldTag: {
      backgroundColor: colors.error,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.small,
    },
    soldTagText: {
      ...Typography.caption,
      fontSize: 10,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
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
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      ...Typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    offerResponseBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    offerResponseText: {
      ...Typography.caption,
      color: colors.textSecondary,
      fontFamily: 'Inter_500Medium',
    },
    offerActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    declineBtn: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
    },
    declineBtnText: {
      ...Typography.caption,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
    },
    acceptBtn: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.primary,
    },
    acceptBtnText: {
      ...Typography.caption,
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
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
    offerBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      maxWidth: '78%',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.large,
      borderWidth: BorderWidth.standard,
    },
    offerOwn: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
      alignSelf: 'flex-end',
      borderBottomRightRadius: BorderRadius.small,
    },
    offerOther: {
      borderColor: colors.amber,
      backgroundColor: 'rgba(245,158,11,0.08)',
      alignSelf: 'flex-start',
      borderBottomLeftRadius: BorderRadius.small,
    },
    offerLabel: { ...Typography.caption, fontFamily: 'Inter_600SemiBold' },
    offerAmount: { ...Typography.subheading },
    textOnPrimary: { color: '#FFFFFF' },
    textMuted: { color: colors.textSecondary },
    textAmber: { color: colors.amber },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingTop: Spacing.base,
      paddingBottom: Spacing['2xl'],
      gap: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
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
    soldInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingTop: Spacing.base,
      paddingBottom: Spacing['2xl'],
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    soldInputText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
  });
}
