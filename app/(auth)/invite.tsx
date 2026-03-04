import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Typography, Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

export default function InviteScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const handleVerify = async () => {
    if (!code.trim()) {
      setError('Please enter your invite code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: dbError } = await supabase
        .from('invites')
        .select('*')
        .eq('code', code.trim().toUpperCase())
        .eq('is_used', false)
        .single();

      if (dbError || !data) {
        setError('Invalid or already used invite code');
        return;
      }

      router.push({
        pathname: '/(auth)/signup',
        params: { inviteCode: code.trim().toUpperCase() },
      });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Dukanoh</Text>
          <Text style={styles.heading}>You're invited</Text>
          <Text style={styles.subtext}>
            Dukanoh is invite-only. Enter your code to get started.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Invite Code"
            placeholder="XXXXXX"
            value={code}
            onChangeText={text => {
              setCode(text);
              setError('');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error}
          />
          <Button label="Continue" onPress={handleVerify} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Button
            label="Log in"
            variant="ghost"
            onPress={() => router.push('/(auth)/login')}
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
    subtext: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    form: { gap: Spacing.md },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerText: { ...Typography.body, color: colors.textSecondary },
  });
}
