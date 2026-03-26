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
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Typography, Spacing, BorderRadius, BorderWidth, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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
  const listRef = useRef<FlatList>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    if (!id || !user) return;

    // Fetch conversation metadata + messages in parallel
    Promise.all([
      supabase
        .from('conversations')
        .select(`
          listing_id, buyer_id, seller_id,
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
        .order('created_at', { ascending: false }),
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
      }
      if (msgs) setMessages(msgs as Message[]);
      setLoading(false);
    });

    const channel = supabase
      .channel(`conversation:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        payload => {
          setMessages(prev => [payload.new as Message, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  const respondToOffer = async (amount: string, accepted: boolean) => {
    if (!user || !id || !meta) return;

    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;
    const content = accepted ? `__OFFER_ACCEPTED__:${amount}` : `__OFFER_DECLINED__:${amount}`;

    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      listing_id: meta.listing_id,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    });
    if (error) {
      Alert.alert('Error', 'Failed to respond to offer. Please try again.');
    }
  };

  const handleSend = async () => {
    if (!text.trim() || !user || !id || !meta) return;

    setSending(true);
    const content = text.trim();
    setText('');

    const receiverId = user.id === meta.buyer_id ? meta.seller_id : meta.buyer_id;

    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      listing_id: meta.listing_id,
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    });

    if (error) {
      setText(content); // Restore text so user can retry
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }

    setSending(false);
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

    let bubble;
    if (item.content.startsWith('__OFFER_ACCEPTED__:')) {
      const amount = item.content.slice('__OFFER_ACCEPTED__:'.length);
      bubble = (
        <View style={[styles.offerResponseBubble, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.offerResponseText}>Offer of £{amount} accepted</Text>
        </View>
      );
    } else if (item.content.startsWith('__OFFER_DECLINED__:')) {
      const amount = item.content.slice('__OFFER_DECLINED__:'.length);
      bubble = (
        <View style={[styles.offerResponseBubble, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="close-circle" size={16} color={colors.error} />
          <Text style={styles.offerResponseText}>Offer of £{amount} declined</Text>
        </View>
      );
    } else if (item.content.startsWith('__OFFER__:')) {
      const amount = item.content.slice('__OFFER__:'.length);

      // Show accept/decline only for the receiver of the offer, and only if no response exists yet
      const hasResponse = messages.some(m =>
        m.content === `__OFFER_ACCEPTED__:${amount}` || m.content === `__OFFER_DECLINED__:${amount}`
      );
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
              <TouchableOpacity style={styles.declineBtn} onPress={() => respondToOffer(amount, false)}>
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => respondToOffer(amount, true)}>
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
        subtitle={meta?.listing_title}
        onSubtitlePress={meta ? () => router.push(`/listing/${meta.listing_id}`) : undefined}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {meta?.listing_status === 'sold' && (
          <View style={styles.soldBanner}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.soldBannerText}>This item has been sold</Text>
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
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Send a message to start the conversation</Text>
            </View>
          }
        />

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
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    soldBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      backgroundColor: colors.surface,
    },
    soldBannerText: {
      ...Typography.caption,
      color: colors.textSecondary,
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
      paddingVertical: Spacing.base,
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
  });
}
