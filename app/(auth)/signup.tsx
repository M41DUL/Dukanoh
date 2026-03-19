import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Keyboard, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
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

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 6;

export default function SignUpScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Per-field validation
  const [usernameError, setUsernameError] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const usernameTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced username availability check
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
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('username', trimmed)
          .limit(1)
          .single();

        if (data) {
          setUsernameError('Username is taken');
          setUsernameValid(false);
        } else {
          setUsernameValid(true);
        }
      } catch {
        // No row found = available
        setUsernameValid(true);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
  }, []);

  const handleUsernameChange = (value: string) => {
    const sanitised = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(sanitised);
    setError('');
    checkUsername(sanitised);
  };

  const isFormValid =
    usernameValid &&
    email.trim().length > 0 &&
    password.length >= PASSWORD_MIN &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const handleSignUp = async () => {
    if (loading) return;
    Keyboard.dismiss();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters`);
      return;
    }
    if (!usernameValid) {
      setError('Please choose a valid username');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.toLowerCase(),
          },
        },
      });
      if (authError) throw authError;
      // Root layout auth effect handles navigation
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (usernameTimer.current) clearTimeout(usernameTimer.current);
    };
  }, []);

  const usernameRightIcon = checkingUsername ? (
    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
  ) : usernameValid ? (
    <Ionicons name="checkmark-circle" size={20} color={lightColors.success} />
  ) : null;

  return (
    <AuthLayout>
      <Text style={styles.heading}>Create account</Text>

      <View style={styles.form}>
        <Input
          placeholder="Username"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={usernameError}
          valid={usernameValid}
          rightIcon={usernameRightIcon}
          hint={!usernameError && !usernameValid && username.length === 0 ? 'Lowercase letters, numbers, and underscores' : undefined}
          {...INPUT_STYLE}
        />
        <Input
          ref={emailRef}
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
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          hint={password.length > 0 && password.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters` : undefined}
          {...INPUT_STYLE}
        />
        <Input
          ref={confirmRef}
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
          error={confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : undefined}
          {...INPUT_STYLE}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
          disabled={!isFormValid}
          variant="secondary"
          style={{ marginTop: Spacing.base }}
        />
        <Text style={styles.terms}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
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
  terms: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
