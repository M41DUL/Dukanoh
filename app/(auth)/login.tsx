import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;
      router.replace('/(tabs)/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Dukanoh</Text>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subtext}>Sign in to continue.</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Password"
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Log in" onPress={handleLogin} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Button
            label="Sign up"
            variant="ghost"
            onPress={() => router.push('/(auth)/invite')}
          />
        </View>
      </View>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingVertical: Spacing['3xl'],
      gap: Spacing['2xl'],
    },
    header: { gap: Spacing.sm },
    wordmark: {
      ...Typography.display,
      color: colors.primaryText,
      marginBottom: Spacing.base,
    },
    heading: { ...Typography.heading, color: colors.textPrimary },
    subtext: { ...Typography.body, color: colors.textSecondary },
    form: { gap: Spacing.base },
    error: { ...Typography.caption, color: colors.error },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerText: { ...Typography.body, color: colors.textSecondary },
  });
}
