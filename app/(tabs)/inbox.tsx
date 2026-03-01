import React from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { Divider } from '@/components/Divider';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface Conversation {
  id: string;
  listing_id: string;
  other_user: { username: string; avatar_url?: string };
  last_message: string;
  updated_at: string;
}

export default function InboxScreen() {
  const conversations: Conversation[] = [];

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
              <Text style={styles.username}>@{item.other_user.username}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.last_message}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <Divider style={styles.separator} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="chatbubbles-outline" size={48} color={Colors.textSecondary} />}
            heading="No messages yet"
            subtext="When you enquire about a listing or receive a message, it'll appear here."
          />
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.base,
    gap: Spacing.md,
  },
  rowContent: { flex: 1 },
  username: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  lastMessage: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  separator: { marginVertical: 0 },
});
