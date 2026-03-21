import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Keyboard, Linking, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { lightColors, Typography, Spacing, FontFamily } from '@/constants/theme';
import { AUTH_INPUT_STYLE, EMAIL_REGEX, getAuthError } from '@/constants/authStyles';
import { supabase } from '@/lib/supabase';
const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 6;

function getPasswordStrength(pw: string): { label: string; color: string } | null {
  if (pw.length === 0) return null;
  if (pw.length < PASSWORD_MIN) return { label: `At least ${PASSWORD_MIN} characters`, color: lightColors.error };
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const variety = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  if (pw.length >= 10 && variety >= 3) return { label: 'Strong password', color: lightColors.success };
  if (pw.length >= 8 && variety >= 2) return { label: 'Good password', color: lightColors.secondary };
  return { label: 'Weak password', color: '#FFA500' };
}

export default function SignUpScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Per-field validation
  const [usernameError, setUsernameError] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
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
    const sanitised = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(sanitised);
    setError('');
    checkUsername(sanitised);
  };

  const isEmailValid = EMAIL_REGEX.test(email.trim());

  const isFormValid =
    usernameValid &&
    isEmailValid &&
    password.length >= PASSWORD_MIN;

  const handleSignUp = async () => {
    if (loading) return;
    Keyboard.dismiss();

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
    } catch (err) {
      setError(getAuthError(err, err instanceof Error ? err.message : 'Something went wrong. Please try again.'));
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

  const passwordStrength = getPasswordStrength(password);

  const usernameRightIcon = checkingUsername ? (
    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
  ) : usernameValid ? (
    <Ionicons name="checkmark-circle" size={20} color={lightColors.success} />
  ) : null;

  return (
    <AuthLayout isDirty={username.length > 0 || email.length > 0 || password.length > 0}>
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
          {...AUTH_INPUT_STYLE}
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
          error={email.trim().length > 0 && !isEmailValid ? 'Enter a valid email address' : undefined}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          {...AUTH_INPUT_STYLE}
        />
        <Input
          ref={passwordRef}
          placeholder="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secureTextEntry
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
          {...AUTH_INPUT_STYLE}
          error={passwordStrength && password.length < PASSWORD_MIN ? passwordStrength.label : undefined}
          hint={passwordStrength && password.length >= PASSWORD_MIN ? passwordStrength.label : undefined}
          hintColor={passwordStrength?.color}
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
          By signing up you agree to our{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL('https://dukanoh.com/terms')}>
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL('https://dukanoh.com/privacy')}>
            Privacy Policy
          </Text>
          .
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
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  termsLink: {
    textDecorationLine: 'underline',
    color: 'rgba(255,255,255,0.9)',
  },
});
