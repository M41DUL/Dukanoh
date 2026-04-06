import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert, View, FlatList, Text, TouchableOpacity, StyleSheet, RefreshControl, Platform, Animated } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Divider } from '@/components/Divider';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { Ionicons } from '@expo/vector-icons';

interface Conversation {
  id: string;
  listing_id: string;
  listing_title: string;
  is_buyer: boolean;
  other_user: { username: string; avatar_url?: string };
  last_message: string;
  updated_at: string;
  unread: boolean;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const { blockedIds } = useBlocked();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const fetchConversations = useCallback(async () => {
    if (!user) return;

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
        buyer:users!conversations_buyer_id_fkey ( username, avatar_url ),
        seller:users!conversations_seller_id_fkey ( username, avatar_url ),
        listing:listings!conversations_listing_id_fkey ( title )
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      Alert.alert('Error', 'Could not load conversations.');
    } else if (data) {
      const mapped: Conversation[] = data
        .filter((c: any) => {
          const otherId = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
          if (blockedIds.includes(otherId)) return false;
          // Filter soft-deleted
          if (c.buyer_id === user.id && c.deleted_by_buyer) return false;
          if (c.seller_id === user.id && c.deleted_by_seller) return false;
          return true;
        })
        .map((c: any) => {
          const isBuyer = c.buyer_id === user.id;
          const other = isBuyer ? c.seller : c.buyer;
          return {
            id: c.id,
            listing_id: c.listing_id,
            listing_title: c.listing?.title ?? '',
            is_buyer: isBuyer,
            other_user: { username: other?.username ?? 'Unknown', avatar_url: other?.avatar_url },
            last_message: c.last_message ?? '',
            updated_at: c.updated_at,
            unread: !!c.last_message_sender_id && c.last_message_sender_id !== user.id,
          };
        });
      setConversations(mapped);
    }

    setLoading(false);
  }, [user, blockedIds]);

  const deleteConversation = useCallback(async (conv: Conversation) => {
    if (!user) return;
    const field = conv.is_buyer ? 'deleted_by_buyer' : 'deleted_by_seller';
    const { error } = await supabase
      .from('conversations')
      .update({ [field]: true })
      .eq('id', conv.id);
    if (error) {
      Alert.alert('Error', 'Could not delete conversation.');
      return;
    }
    setConversations(prev => prev.filter(c => c.id !== conv.id));
  }, [user]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  useFocusEffect(useCallback(() => {
    fetchConversations();
  }, [fetchConversations]));

  // Realtime: listen for conversation updates (new messages update last_message + updated_at)
  const handleRealtimeChange = useCallback((payload: any) => {
    if (!user) return;
    const { eventType, new: row } = payload;

    if (eventType === 'UPDATE' && row) {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === row.id);
        if (idx === -1) {
          fetchConversations();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message: row.last_message ?? '',
          updated_at: row.updated_at,
          unread: !!row.last_message_sender_id && row.last_message_sender_id !== user.id,
        };
        updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return updated;
      });
    } else {
      fetchConversations();
    }
  }, [user, fetchConversations]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${user.id}` },
        handleRealtimeChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `seller_id=eq.${user.id}` },
        handleRealtimeChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Android: toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
    if (msg.startsWith('__OFFER_ACCEPTED__:') || msg.startsWith('__OFFER_DECLINED__:')) {
      const isAccepted = msg.startsWith('__OFFER_ACCEPTED__:');
      const payload = msg.slice(isAccepted ? '__OFFER_ACCEPTED__:'.length : '__OFFER_DECLINED__:'.length);
      const parts = payload.split(':');
      const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
      return `Offer of £${amount} ${isAccepted ? 'accepted' : 'declined'}`;
    }
    if (msg.startsWith('__OFFER__:')) return `Offer: £${msg.slice('__OFFER__:'.length)}`;
    return msg;
  };

  const renderRightActions = (item: Conversation) => (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
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
          uri={item.other_user.avatar_url}
          initials={item.other_user.username[0]?.toUpperCase()}
          size="medium"
        />
        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={[styles.username, item.unread && styles.usernameUnread]} numberOfLines={1}>@{item.other_user.username}</Text>
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

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Inbox" />
        <LoadingSpinner />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
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
