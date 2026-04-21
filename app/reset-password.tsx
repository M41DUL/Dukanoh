import React, { useState, useEffect } from 'react';
import { View, Text, Keyboard, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { lightColors, Typography, Spacing } from '@/constants/theme';
import { AUTH_INPUT_STYLE, getAuthError, withTimeout } from '@/constants/authStyles';
import { supabase } from '@/lib/supabase';

const PASSWORD_MIN = 6;

export default function ResetPasswordScreen() {
  const { token_hash, type } = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(!!token_hash);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Exchange the token from the email link for a session
  useEffect(() => {
    if (!token_hash || type !== 'recovery') return;
    supabase.auth.verifyOtp({ token_hash, type: 'recovery' }).then(({ error: otpError }) => {
      if (otpError) setError('This reset link has expired. Please request a new one.');
      setVerifying(false);
    });
  }, [token_hash, type]);

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

  if (verifying) {
    return (
      <AuthLayout>
        <LoadingSpinner />
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <Text style={styles.heading}>Password updated.</Text>
        <Text style={styles.subtitle}>
          Your new password is set. You're good to go.
        </Text>
        <Button
          label="Back to Dukanoh"
          onPress={() => router.replace('/(tabs)')}
          variant="secondary"
          style={{ marginTop: Spacing.lg }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Text style={styles.heading}>New password</Text>
      <Text style={styles.subtitle}>
        Choose a new password for your account.
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
