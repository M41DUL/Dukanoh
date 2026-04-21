import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, BorderWidth, ColorTokens, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type FeedbackType = 'bug' | 'feature' | 'general';

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'general', label: 'General feedback' },
];

export default function FeedbackScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert('Add a message', 'Please write something before submitting.');
      return;
    }
    if (!user) return;

    setSubmitting(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      type,
      message: message.trim(),
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Something went wrong', 'Could not send your feedback. Please try again.');
      return;
    }

    Alert.alert('Thanks for the feedback', 'We read everything. It goes straight to the team.', [
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  return (
    <ScreenWrapper>
      <Header title="Feedback" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>What is this about?</Text>
          <View style={styles.typeRow}>
            {TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeChip, type === t.value && styles.typeChipActive]}
                onPress={() => setType(t.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeChipText, type === t.value && styles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Your message</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Tell us what's on your mind…"
            placeholderTextColor={colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={styles.charCount}>{message.length}/1000</Text>

          <Button
            label="Send feedback"
            variant="primary"
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.md,
    },
    label: {
      fontSize: 13,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: -Spacing.xs,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    typeChip: {
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    typeChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeChipText: {
      fontSize: 14,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    typeChipTextActive: {
      color: '#FFFFFF',
    },
    textArea: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      padding: Spacing.base,
      fontSize: 15,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      minHeight: 140,
    },
    charCount: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      textAlign: 'right',
      marginTop: -Spacing.sm,
    },
    submitBtn: {
      marginTop: Spacing.sm,
    },
  });
}
