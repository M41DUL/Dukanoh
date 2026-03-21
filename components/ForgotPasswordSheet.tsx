import React, { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { lightColors, Spacing, FontFamily } from '@/constants/theme';
import { AUTH_INPUT_STYLE, EMAIL_REGEX } from '@/constants/authStyles';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Input } from './Input';
import { supabase } from '@/lib/supabase';

interface ForgotPasswordSheetProps {
  visible: boolean;
  onClose: () => void;
  initialEmail?: string;
}

export function ForgotPasswordSheet({ visible, onClose, initialEmail = '' }: ForgotPasswordSheetProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Sync initialEmail when sheet opens
  useEffect(() => {
    if (visible) {
      setEmail(initialEmail);
      setError('');
      setSent(false);
    }
  }, [visible, initialEmail]);

  const handleSend = async () => {
    if (loading) return;
    Keyboard.dismiss();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={lightColors.primary}
      handleColor="rgba(255,255,255,0.3)"
    >
      {sent ? (
        <View style={styles.sentContainer}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a reset link to {email.trim()}. Tap the link to set a new password.
          </Text>
          <Button
            label="Done"
            onPress={onClose}
            variant="secondary"
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      ) : (
        <>
          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>
            Enter the email address linked to your account and we'll send you a reset link.
          </Text>

          <View style={styles.form}>
            <Input
              placeholder="Email"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              {...AUTH_INPUT_STYLE}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label="Send reset link"
              onPress={handleSend}
              loading={loading}
              disabled={!EMAIL_REGEX.test(email.trim())}
              variant="secondary"
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.lg,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: {
    gap: Spacing.sm,
  },
  error: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: lightColors.error,
  },
  sentContainer: {},
});
