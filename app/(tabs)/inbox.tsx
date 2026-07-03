import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, FlatList, Text, TouchableOpacity, StyleSheet, RefreshControl, Platform, Animated } from 'react-native';
import { router } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, BorderRadius, FontFamily, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useDeleteConversation } from '@/lib/mutations';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { Ionicons } from '@expo/vector-icons';

interface Conversation {
  id: string;
  listing_id: string;
  listing_title: string;
  is_buyer: boolean;
  other_user: {
    username:    string;
    avatar_url?: string;
    is_official?: boolean;
    is_deleted?: boolean;
  };
  last_message: string;
  updated_at: string;
  unread: boolean;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const conversationsQuery = useQuery({
    queryKey: queryKeys.inbox.list(user?.id),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          listing_id,
          buyer_id,
          seller_id,
          last_message,
          last_message_sender_id,
          updated_at,
          deleted_by_buyer,
          deleted_by_seller,
          buyer:users!conversations_buyer_id_fkey ( username, avatar_url, is_official, deleted_at ),
          seller:users!conversations_seller_id_fkey ( username, avatar_url, is_official, deleted_at ),
          listing:listings!conversations_listing_id_fkey ( title )
        `)
        .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
        .order('updated_at', { ascending: false })
        .limit(50)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []).map((c: any) => {
        const isBuyer = c.buyer_id === user!.id;
        const other = isBuyer ? c.seller : c.buyer;
        return {
          id: c.id,
          listing_id: c.listing_id,
          buyer_id: c.buyer_id,
          seller_id: c.seller_id,
          listing_title: c.listing?.title ?? '',
          is_buyer: isBuyer,
          other_user: {
            username:    other?.username ?? 'Unknown',
            avatar_url:  other?.avatar_url,
            is_official: other?.is_official ?? false,
            is_deleted:  !!other?.deleted_at,
          },
          last_message: c.last_message ?? '',
          updated_at: c.updated_at,
          unread: !!c.last_message_sender_id && c.last_message_sender_id !== user!.id,
          deleted_by_buyer: c.deleted_by_buyer,
          deleted_by_seller: c.deleted_by_seller,
        };
      });
    },
    enabled: !!user,
  });

  useRefreshOnFocus(conversationsQuery.refetch);

  // Realtime: any change to a conversation involving this user invalidates the
  // inbox cache so the query refetches. Payload row shape (raw conversations
  // row) does not match the cached, mapped shape, so invalidate-and-refetch is
  // safer than setQueryData.
  useEffect(() => {
    if (!user) return;

    const handleChange = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
    };

    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${user.id}` },
        handleChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `seller_id=eq.${user.id}` },
        handleChange
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const conversations = useMemo<Conversation[]>(() => {
    if (!user || !conversationsQuery.data) return [];
    return conversationsQuery.data
      .filter(c => {
        const otherId = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
        if (blockedIds.includes(otherId)) return false;
        if (c.buyer_id === user.id && c.deleted_by_buyer) return false;
        if (c.seller_id === user.id && c.deleted_by_seller) return false;
        return true;
      })
      .map(c => ({
        id: c.id,
        listing_id: c.listing_id,
        listing_title: c.listing_title,
        is_buyer: c.is_buyer,
        other_user: c.other_user,
        last_message: c.last_message,
        updated_at: c.updated_at,
        unread: c.unread,
      }));
  }, [user, conversationsQuery.data, blockedIds]);

  const deleteConversationMutation = useDeleteConversation();

  const deleteConversation = useCallback((conv: Conversation) => {
    if (!user) return;
    deleteConversationMutation.mutate(
      { conversationId: conv.id, isBuyer: conv.is_buyer, userId: user.id },
      {
        onError: () => Alert.alert('Error', 'Could not delete conversation.'),
      }
    );
  }, [user, deleteConversationMutation]);

  const confirmDelete = useCallback((conv: Conversation) => {
    Alert.alert(
      'Delete conversation',
      'This will remove the conversation from your inbox. The other person will still be able to see it.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeableRefs.current.get(conv.id)?.close() },
        { text: 'Delete', style: 'destructive', onPress: () => deleteConversation(conv) },
      ],
      { cancelable: true }
    );
  }, [deleteConversation]);

  // Android: toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const deleteSelected = useCallback(async () => {
    const toDelete = conversations.filter(c => selectedIds.has(c.id));
    await Promise.all(toDelete.map(deleteConversation));
    setSelectedIds(new Set());
  }, [conversations, selectedIds, deleteConversation]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const formatLastMessage = (msg: string) => {
    // Legacy bidding messages from the removed offer feature — show a neutral
    // preview instead of the raw "__OFFER__:40" protocol string.
    if (msg.startsWith('__OFFER__:') || msg.startsWith('__OFFER_ACCEPTED__:') || msg.startsWith('__OFFER_DECLINED__:')) {
      return 'Message';
    }
    return msg;
  };

  // eslint-disable-next-line react/display-name
  const renderRightActions = (item: Conversation) => (
    _progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>
  ) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => confirmDelete(item)}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </TouchableOpacity>
    );
  };

  const renderRow = ({ item }: { item: Conversation }) => {
    const isSelected = selectedIds.has(item.id);
    const rowContent = (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => {
          if (Platform.OS === 'android' && selectedIds.size > 0) {
            toggleSelect(item.id);
          } else {
            router.push(`/conversation/${item.id}`);
          }
        }}
        onLongPress={() => Platform.OS === 'android' && toggleSelect(item.id)}
        delayLongPress={300}
        activeOpacity={0.8}
      >
        {Platform.OS === 'android' && selectedIds.size > 0 && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
        <Avatar
          uri={item.other_user.is_deleted ? undefined : item.other_user.avatar_url}
          initials={item.other_user.is_deleted ? undefined : item.other_user.username[0]?.toUpperCase()}
          size="medium"
        />
        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={[styles.username, item.unread && styles.usernameUnread]} numberOfLines={1}>
              {item.other_user.is_deleted ? 'Deleted member' : `@${item.other_user.username}`}
            </Text>
            {item.other_user.is_official && !item.other_user.is_deleted && (
              <View style={styles.officialPill}>
                <Text style={styles.officialPillText}>Official</Text>
              </View>
            )}
            {item.unread && <View style={styles.unreadDot} />}
            <Text style={[styles.time, item.unread && styles.timeUnread]}>{formatTime(item.updated_at)}</Text>
          </View>
          {item.listing_title ? (
            <Text style={styles.listingTitle} numberOfLines={1}>{item.listing_title}</Text>
          ) : null}
          <Text style={[styles.lastMessage, item.unread && styles.lastMessageUnread]} numberOfLines={1}>
            {formatLastMessage(item.last_message)}
          </Text>
        </View>
      </TouchableOpacity>
    );

    if (Platform.OS === 'ios') {
      return (
        <Swipeable
          ref={ref => {
            if (ref) swipeableRefs.current.set(item.id, ref);
            else swipeableRefs.current.delete(item.id);
          }}
          renderRightActions={renderRightActions(item)}
          rightThreshold={60}
          overshootRight={false}
        >
          {rowContent}
        </Swipeable>
      );
    }

    return rowContent;
  };

  if (conversationsQuery.isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Inbox" />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (conversationsQuery.isError) {
    return (
      <ScreenWrapper>
        <Header title="Inbox" />
        <EmptyState
          icon={<Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />}
          heading="Couldn't load conversations"
          subtext="Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => conversationsQuery.refetch()}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      {Platform.OS === 'android' && selectedIds.size > 0 ? (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={() => setSelectedIds(new Set())} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.selectionTitle}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={deleteSelected} hitSlop={8}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <Header title="Inbox" />
      )}
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        ItemSeparatorComponent={() => <Divider style={styles.separator} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={conversationsQuery.isRefetching}
            onRefresh={() => conversationsQuery.refetch()}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />}
            heading="No messages yet"
            subtext="When you enquire about a listing or receive a message, it'll appear here."
          />
        }
      />
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    list: { flexGrow: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.base,
      gap: Spacing.md,
      backgroundColor: colors.background,
    },
    rowSelected: {
      backgroundColor: colors.surface,
    },
    rowContent: { flex: 1 },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    username: {
      ...Typography.body,
      color: colors.textPrimary,
      fontFamily: 'Inter_600SemiBold',
      flex: 1,
    },
    usernameUnread: {
      fontFamily: 'Inter_700Bold',
    },
    officialPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
      backgroundColor: '#0D0D0D',
    },
    officialPillText: {
      fontSize: 10,
      ...FontFamily.semibold,
      color: '#FFFFFF',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginLeft: Spacing.xs,
    },
    time: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginLeft: Spacing.sm,
    },
    timeUnread: {
      color: colors.primaryText,
    },
    listingTitle: { ...Typography.caption, color: colors.textSecondary, marginTop: 1 },
    lastMessage: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
    lastMessageUnread: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    separator: { marginVertical: 0 },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    selectionTitle: {
      ...Typography.body,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    deleteAction: {
      backgroundColor: colors.error,
      justifyContent: 'center',
      alignItems: 'center',
      width: 72,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
  });
}
