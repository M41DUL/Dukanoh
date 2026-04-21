import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Keyboard, Linking, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { lightColors, Typography, Spacing } from '@/constants/theme';
import {
  AUTH_INPUT_STYLE,
  EMAIL_REGEX,
  USERNAME_REGEX,
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
  getAuthError,
  getPasswordStrength,
  withTimeout,
} from '@/constants/authStyles';
import { supabase } from '@/lib/supabase';

function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function dobToIso(display: string): string | null {
  const parts = display.replace(/\s/g, '').split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  const date = new Date(`${y}-${m}-${d}`);
  if (isNaN(date.getTime())) return null;
  return `${y}-${m}-${d}`;
}

function isOver18(isoDate: string): boolean {
  const dob = new Date(isoDate);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob <= cutoff;
}

export default function SignUpScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dobDisplay, setDobDisplay] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [marketingPush, setMarketingPush] = useState(false);

  // Per-field validation
  const [usernameError, setUsernameError] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [emailTouched, setEmailTouched] = useState(false);

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

  const [usernameHint, setUsernameHint] = useState('');

  const handleUsernameChange = (value: string) => {
    const lowered = value.toLowerCase();
    const sanitised = lowered.replace(/[^a-z0-9_]/g, '');
    if (sanitised !== lowered) {
      setUsernameHint('Only letters, numbers, and underscores');
    } else {
      setUsernameHint('');
    }
    setUsername(sanitised);
    setError('');
    checkUsername(sanitised);
  };

  const isEmailValid = EMAIL_REGEX.test(email.trim());

  const dobIso = dobToIso(dobDisplay);
  const dobValid = !!dobIso;
  const dobOver18 = dobIso ? isOver18(dobIso) : null;

  const isFormValid =
    usernameValid &&
    isEmailValid &&
    password.length >= PASSWORD_MIN &&
    dobValid &&
    dobOver18 === true;

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
      const { error: authError } = await withTimeout(
        supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: username.toLowerCase(),
            },
          },
        }),
      );
      if (authError) throw authError;
      // Write DOB and optional marketing push consent
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('users').update({
          dob: dobIso,
          ...(marketingPush ? { marketing_push_consent: true } : {}),
        }).eq('id', user.id);
      }
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
          hint={usernameHint || (!usernameError && !usernameValid && username.length === 0 ? 'Lowercase letters, numbers, and underscores' : undefined)}
          {...AUTH_INPUT_STYLE}
        />
        <Input
          ref={emailRef}
          placeholder="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); setEmailTouched(false); }}
          onBlur={() => setEmailTouched(true)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          error={emailTouched && email.trim().length > 0 && !isEmailValid ? 'Enter a valid email address' : undefined}
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
        <Input
          placeholder="Date of birth (DD/MM/YYYY)"
          value={dobDisplay}
          onChangeText={v => setDobDisplay(formatDobInput(v))}
          keyboardType="number-pad"
          maxLength={10}
          returnKeyType="done"
          error={dobValid && dobOver18 === false ? 'You must be 18 or over to use Dukanoh' : undefined}
          {...AUTH_INPUT_STYLE}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={styles.marketingRow}
          onPress={() => setMarketingPush(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, marketingPush && styles.checkboxChecked]}>
            {marketingPush && <Ionicons name="checkmark" size={12} color="#0D0D0D" />}
          </View>
          <Text style={styles.marketingText}>
            Send me promotions and new feature updates from Dukanoh.
          </Text>
        </TouchableOpacity>
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
  marketingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#C7F75E',
    borderColor: '#C7F75E',
  },
  marketingText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 17,
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
