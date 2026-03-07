import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
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

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  useEffect(() => {
    if (!id) return;

    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
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
  }, [id]);

  const handleSend = async () => {
    if (!text.trim() || !user || !id) return;

    setSending(true);
    const content = text.trim();
    setText('');

    await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
    });

    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;

    if (item.content.startsWith('__OFFER__:')) {
      const amount = item.content.slice('__OFFER__:'.length);
      return (
        <View style={[styles.offerBubble, isOwn ? styles.offerOwn : styles.offerOther]}>
          <Ionicons name="pricetag-outline" size={14} color={isOwn ? '#FFFFFF' : colors.amber} />
          <View>
            <Text style={[styles.offerLabel, isOwn ? styles.textOnPrimary : styles.textMuted]}>Offer</Text>
            <Text style={[styles.offerAmount, isOwn ? styles.textOnPrimary : styles.textAmber]}>£{amount}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <ScreenWrapper>
      <Header showBack title="Message" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.inputRow}>
          <Input
            placeholder="Message…"
            value={text}
            onChangeText={setText}
            containerStyle={styles.inputContainer}
            returnKeyType="send"
            onSubmitEditing={handleSend}
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
    messageList: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
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
