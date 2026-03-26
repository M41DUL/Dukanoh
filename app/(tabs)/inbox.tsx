import React, { useState, useCallback, useMemo } from 'react';
import { Alert, View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
import { Ionicons } from '@expo/vector-icons';

interface Conversation {
  id: string;
  listing_id: string;
  other_user: { username: string; avatar_url?: string };
  last_message: string;
  updated_at: string;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
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
        updated_at,
        buyer:users!conversations_buyer_id_fkey ( username, avatar_url ),
        seller:users!conversations_seller_id_fkey ( username, avatar_url )
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('updated_at', { ascending: false });

    if (error) {
      Alert.alert('Error', 'Could not load conversations.');
    } else if (data) {
      const mapped: Conversation[] = data.map((c: any) => {
        const isBuyer = c.buyer_id === user.id;
        const other = isBuyer ? c.seller : c.buyer;
        return {
          id: c.id,
          listing_id: c.listing_id,
          other_user: { username: other?.username ?? 'Unknown', avatar_url: other?.avatar_url },
          last_message: c.last_message ?? '',
          updated_at: c.updated_at,
        };
      });
      setConversations(mapped);
    }

    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    fetchConversations();
  }, [fetchConversations]));

  // Realtime: listen for conversation updates (new messages update last_message + updated_at)
  useFocusEffect(useCallback(() => {
    if (!user) return;

    const channel = supabase
      .channel('inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${user.id}` },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `seller_id=eq.${user.id}` },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations]));

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
    if (msg.startsWith('__OFFER__:')) {
      return `Offer: £${msg.slice('__OFFER__:'.length)}`;
    }
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
                <Text style={styles.username} numberOfLines={1}>@{item.other_user.username}</Text>
                <Text style={styles.time}>{formatTime(item.updated_at)}</Text>
              </View>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {formatLastMessage(item.last_message)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <Divider style={styles.separator} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
      fontWeight: '600',
      flex: 1,
    },
    time: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginLeft: Spacing.sm,
    },
    lastMessage: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
    separator: { marginVertical: 0 },
  });
}
