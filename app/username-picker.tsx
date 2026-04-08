import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { lightColors, Typography, Spacing } from '@/constants/theme';
import {
  AUTH_INPUT_STYLE,
  USERNAME_REGEX,
  USERNAME_MIN,
  USERNAME_MAX,
} from '@/constants/authStyles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function UsernamePickerScreen() {
  const { user, onboardingCompleted, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameHint, setUsernameHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const usernameTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const checkUsername = useCallback((value: string) => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);

    const trimmed = value.toLowerCase();

    if (trimmed.length < USERNAME_MIN) {
      setUsernameError(trimmed.length > 0 ? `At least ${USERNAME_MIN} characters` : '');
      setUsernameValid(false);
      return;
    }
    if (trimmed.length > USERNAME_MAX) {
      setUsernameError(`Maximum ${USERNAME_MAX} characters`);
      setUsernameValid(false);
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameError('Only lowercase letters, numbers, and underscores');
      setUsernameValid(false);
      return;
    }

    setUsernameError('');
    setCheckingUsername(true);

    usernameTimer.current = setTimeout(async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('users')
          .select('id')
          .eq('username', trimmed)
          .maybeSingle();

        if (queryError) {
          setUsernameError('Could not check availability');
          setUsernameValid(false);
        } else if (data) {
          setUsernameError('Username is taken');
          setUsernameValid(false);
        } else {
          setUsernameValid(true);
        }
      } catch {
        setUsernameError('Could not check availability');
        setUsernameValid(false);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
  }, []);

  const handleUsernameChange = (value: string) => {
    const lowered = value.toLowerCase();
    const sanitised = lowered.replace(/[^a-z0-9_]/g, '');
    setUsernameHint(sanitised !== lowered ? 'Only letters, numbers, and underscores' : '');
    setUsername(sanitised);
    setError('');
    checkUsername(sanitised);
  };

  const handleSave = async () => {
    if (!usernameValid || !user) return;
    Keyboard.dismiss();
    setSaving(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ username: username.toLowerCase(), username_confirmed: true })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Refresh profile first so needsUsername is false before navigating
      // This prevents the layout watcher from bouncing back to this screen
      await refreshProfile();
      router.replace(onboardingCompleted ? '/(tabs)' : '/onboarding');
    } catch {
      setError('Could not save username. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (usernameTimer.current) clearTimeout(usernameTimer.current);
    };
  }, []);

  const rightIcon = checkingUsername ? (
    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
  ) : usernameValid ? (
    <Ionicons name="checkmark-circle" size={20} color={lightColors.success} />
  ) : null;

  return (
    <AuthLayout isDirty={false}>
      <Text style={styles.heading}>Choose a username</Text>
      <Text style={styles.subtitle}>This is how others will find you on Dukanoh.</Text>

      <View style={styles.form}>
        <Input
          placeholder="Username"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          textContentType="username"
          returnKeyType="done"
          onSubmitEditing={handleSave}
          error={usernameError}
          valid={usernameValid}
          rightIcon={rightIcon}
          hint={usernameHint || (!usernameError && !usernameValid && username.length === 0 ? 'Lowercase letters, numbers, and underscores' : undefined)}
          {...AUTH_INPUT_STYLE}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Continue"
          onPress={handleSave}
          loading={saving}
          disabled={!usernameValid}
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
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32,
  },
  form: {
    gap: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: lightColors.error,
  },
});
