import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    fullName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const update = (key: keyof typeof form) => (value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSignUp = async () => {
    if (!form.email || !form.password || !form.username || !form.fullName) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            username: form.username,
            full_name: form.fullName,
          },
        },
      });

      if (authError) throw authError;

      router.replace('/onboarding');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <Header showBack title="Create account" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Full Name"
          placeholder="Your full name"
          value={form.fullName}
          onChangeText={update('fullName')}
          autoCapitalize="words"
        />
        <Input
          label="Username"
          placeholder="username"
          value={form.username}
          onChangeText={update('username')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Email"
          placeholder="you@email.com"
          value={form.email}
          onChangeText={update('email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Password"
          placeholder="Create a password"
          value={form.password}
          onChangeText={update('password')}
          secureTextEntry
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
          style={styles.submit}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      padding: Spacing.base,
      gap: Spacing.base,
      paddingBottom: Spacing['3xl'],
    },
    error: { ...Typography.caption, color: colors.error },
    submit: { marginTop: Spacing.sm },
  });
}
