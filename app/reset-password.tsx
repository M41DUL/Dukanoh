import React, { useState } from 'react';
import { View, Text, Keyboard, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { lightColors, Typography, Spacing } from '@/constants/theme';
import { AUTH_INPUT_STYLE, getAuthError, withTimeout } from '@/constants/authStyles';
import { supabase } from '@/lib/supabase';

const PASSWORD_MIN = 6;

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (loading) return;
    Keyboard.dismiss();

    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await withTimeout(
        supabase.auth.updateUser({ password }),
      );
      if (updateError) throw updateError;
      setDone(true);
    } catch (err) {
      setError(getAuthError(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <Text style={styles.heading}>Password updated</Text>
        <Text style={styles.subtitle}>
          Your password has been changed. You're all set.
        </Text>
        <Button
          label="Continue"
          onPress={() => router.replace('/(tabs)')}
          variant="secondary"
          style={{ marginTop: Spacing.lg }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Text style={styles.heading}>Set new password</Text>
      <Text style={styles.subtitle}>
        Enter your new password below.
      </Text>

      <View style={styles.form}>
        <Input
          placeholder="New password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleReset}
          {...AUTH_INPUT_STYLE}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Update password"
          onPress={handleReset}
          loading={loading}
          disabled={password.length < PASSWORD_MIN}
          variant="secondary"
          style={{ marginTop: Spacing.base }}
        />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  heading: {
    ...Typography.display,
    color: '#FFFFFF',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  form: {
    gap: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: lightColors.error,
  },
});
