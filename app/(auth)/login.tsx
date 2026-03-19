import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Keyboard, StyleSheet } from 'react-native';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ForgotPasswordSheet } from '@/components/ForgotPasswordSheet';
import { lightColors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const INPUT_STYLE = {
  inputContainerStyle: {
    backgroundColor: lightColors.overlay,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.medium,
  },
  placeholderColor: 'rgba(255,255,255,0.4)',
  style: { color: '#FFFFFF' },
} as const;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Text style={styles.heading}>Sign in</Text>

      <View style={styles.form}>
        <Input
          placeholder="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          {...INPUT_STYLE}
        />
        <Input
          ref={passwordRef}
          placeholder="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secureTextEntry
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          {...INPUT_STYLE}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Sign in"
          onPress={handleLogin}
          loading={loading}
          disabled={!email.trim() || !password}
          variant="secondary"
          style={{ marginTop: Spacing.base }}
        />
        <Button
          label="Forgot your password?"
          onPress={() => { Keyboard.dismiss(); setShowForgot(true); }}
          variant="ghost"
          size="sm"
          textColor="rgba(255,255,255,0.7)"
          style={{ marginTop: Spacing.xl }}
        />
      </View>

      <ForgotPasswordSheet
        visible={showForgot}
        onClose={() => setShowForgot(false)}
        initialEmail={email.trim()}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  heading: {
    ...Typography.display,
    color: '#FFFFFF',
    marginBottom: 40,
  },
  form: {
    gap: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: lightColors.error,
  },
});
