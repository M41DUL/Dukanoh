import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

const DISPUTE_REASONS = [
  'Item not received',
  'Item not as described',
  'Item damaged',
  'Wrong item sent',
  'Other',
];

export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('Select a reason', 'Please choose a reason for your dispute.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Add a description', 'Please describe the issue in a few words.');
      return;
    }
    if (!user || !id) return;

    setSubmitting(true);

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'disputed',
        dispute_reason: reason,
        dispute_description: description.trim(),
        disputed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('buyer_id', user.id)  // safety: only the buyer can dispute
      .eq('status', 'shipped'); // guard: only valid from shipped state

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', 'Could not raise dispute. Please try again.');
      return;
    }

    Alert.alert(
      'Dispute raised',
      'Our team has been notified and will review your dispute. We aim to resolve disputes within 7 days.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <ScreenWrapper>
      <Header title="Raise a dispute" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Tell us what went wrong and we'll look into it. Funds are held until the dispute is resolved.
          </Text>

          {/* Reason selection */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>What's the issue?</Text>
            <View style={styles.reasonList}>
              {DISPUTE_REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonOption,
                    { borderColor: reason === r ? colors.primary : colors.border, backgroundColor: colors.surface },
                    reason === r && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => setReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: reason === r ? colors.primary : colors.border },
                  ]}>
                    {reason === r && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Describe the issue</Text>
            <View style={[styles.textAreaWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary }]}
                placeholder="e.g. The item arrived with a large tear on the sleeve that wasn't shown in the photos."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={5}
                value={description}
                onChangeText={t => setDescription(t.slice(0, 500))}
                maxLength={500}
                textAlignVertical="top"
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textSecondary }]}>
              {description.length}/500
            </Text>
          </View>

          <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Our team reviews all disputes. If we rule in your favour, your item price will be refunded. The buyer protection fee is non-refundable.
            </Text>
          </View>

          <Button
            label="Submit dispute"
            onPress={handleSubmit}
            loading={submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    intro: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 20,
    },
    section: {
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    reasonList: {
      gap: Spacing.sm,
    },
    reasonOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderWidth: 1.5,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    reasonText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    textAreaWrap: {
      borderRadius: BorderRadius.medium,
      borderWidth: 1.5,
      padding: Spacing.base,
      minHeight: 120,
    },
    textArea: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 22,
      minHeight: 100,
    },
    charCount: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      textAlign: 'right',
    },
    infoBox: {
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    infoText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
  });
}
