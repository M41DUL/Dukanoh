import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, ColorTokens, FontFamily } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function AppealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (reason.trim().length < 20) {
      Alert.alert('More detail needed', 'Please explain why you are appealing in at least a few sentences.');
      return;
    }
    if (!user || !id) return;

    setSubmitting(true);

    const isBuyer = await supabase
      .from('orders')
      .select('buyer_id')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => data?.buyer_id === user.id);

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'disputed',
        appealed_at: new Date().toISOString(),
        appeal_by: isBuyer ? 'buyer' : 'seller',
        appeal_reason: reason.trim(),
      })
      .eq('id', id)
      .eq('status', 'resolved');

    setSubmitting(false);

    if (error) {
      Alert.alert('Something went wrong', 'Could not submit your appeal. Please try again.');
      return;
    }

    Alert.alert(
      'Appeal submitted',
      'Our team will review your appeal and respond within 7 days.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <ScreenWrapper>
      <Header title="Appeal decision" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            If you disagree with the decision, you can appeal within 7 days. Explain what new information or evidence supports your case.
          </Text>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Why are you appealing?</Text>
            <View style={[styles.textAreaWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary }]}
                placeholder="Explain what you believe was missed or misunderstood in the original decision, and any new evidence you can provide."
                placeholderTextColor={colors.textSecondary}
                underlineColorAndroid="transparent"
                multiline
                numberOfLines={6}
                value={reason}
                onChangeText={t => setReason(t.slice(0, 600))}
                maxLength={600}
                textAlignVertical="top"
              />
            </View>
            <Text style={[styles.charCount, { color: colors.textSecondary }]}>{reason.length}/600</Text>
          </View>

          <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Appeals are reviewed by our team within 7 days. The original decision stands until the appeal is resolved. You can only appeal once per dispute.
            </Text>
          </View>

          <Button
            label="Submit appeal"
            onPress={handleSubmit}
            loading={submitting}
            disabled={reason.trim().length < 20 || submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(_colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.lg,
      gap: Spacing.lg,
    },
    intro: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      lineHeight: 20,
    },
    section: {
      gap: Spacing.md,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    textAreaWrap: {
      borderRadius: BorderRadius.medium,
      borderWidth: 1.5,
      padding: Spacing.base,
      minHeight: 140,
    },
    textArea: {
      fontSize: 14,
      fontFamily: FontFamily.regular,
      lineHeight: 22,
      minHeight: 120,
    },
    charCount: {
      fontSize: 12,
      fontFamily: FontFamily.regular,
      textAlign: 'right',
    },
    infoBox: {
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    infoText: {
      fontSize: 13,
      fontFamily: FontFamily.regular,
      lineHeight: 18,
    },
  });
}
