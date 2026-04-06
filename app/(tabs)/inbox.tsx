import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert, View, FlatList, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
        buyer:users!conversations_buyer_id_fkey ( username, avatar_url ),
        seller:users!conversations_seller_id_fkey ( username, avatar_url )
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
          return !blockedIds.includes(otherId);
        })
        .map((c: any) => {
          const isBuyer = c.buyer_id === user.id;
          const other = isBuyer ? c.seller : c.buyer;
          return {
            id: c.id,
            listing_id: c.listing_id,
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
          // Conversation not in list yet — full fetch needed
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
        // Re-sort by updated_at descending
        updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return updated;
      });
    } else {
      // INSERT or DELETE — fetch all to get joined user data
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
      // New format: "offerId:amount", Legacy: "amount"
      const amount = parts.length >= 2 ? parts.slice(1).join(':') : parts[0];
      return `Offer of £${amount} ${isAccepted ? 'accepted' : 'declined'}`;
    }
    if (msg.startsWith('__OFFER__:')) return `Offer: £${msg.slice('__OFFER__:'.length)}`;
    return msg;
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
      <Header title="Inbox" />
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/conversation/${item.id}`)}
            activeOpacity={0.8}
          >
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
              <Text style={[styles.lastMessage, item.unread && styles.lastMessageUnread]} numberOfLines={1}>
                {formatLastMessage(item.last_message)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
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
    lastMessage: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
    lastMessageUnread: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
    separator: { marginVertical: 0 },
  });
}
