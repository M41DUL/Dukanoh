import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, ClipPath, Rect, Defs } from 'react-native-svg';
import { lightColors, Spacing, FontFamily } from '@/constants/theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { signInWithApple, signInWithGoogle } from '@/lib/socialAuth';

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <ClipPath id="clip">
          <Rect width="24" height="24" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#clip)">
        <Path d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" fill="#4285F4" />
        <Path d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z" fill="#34A853" />
        <Path d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z" fill="#FBBC05" />
        <Path d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335" />
      </G>
    </Svg>
  );
}

const COPY = {
  join: {
    title: "Let\u2019s get started",
    subtitle: 'Create your account to explore more.',
  },
  login: {
    title: 'Sign in',
    subtitle: 'Pick up where you left off.',
  },
} as const;

interface AuthSheetProps {
  visible: boolean;
  mode: 'join' | 'login';
  onClose: () => void;
  onEmail: () => void;
}

export function AuthSheet({ visible, mode, onClose, onEmail }: AuthSheetProps) {
  const copy = COPY[mode];
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleApple = async () => {
    setAppleLoading(true);
    try {
      await signInWithApple();
      onClose();
    } catch (err: unknown) {
      // User cancelled — no alert needed
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple sign-in failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: unknown) {
      // User cancelled — no alert needed
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'SIGN_IN_CANCELLED') return;
      Alert.alert('Google sign-in failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const isLoading = appleLoading || googleLoading;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={lightColors.primary}
      handleColor="rgba(255,255,255,0.3)"
    >
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <Button
            label="Continue with Apple"
            onPress={handleApple}
            loading={appleLoading}
            disabled={isLoading}
            icon={<Ionicons name="logo-apple" size={18} color="#FFFFFF" />}
            backgroundColor="#000000"
            textColor="#FFFFFF"
          />
        )}
        <Button
          label="Continue with Google"
          onPress={handleGoogle}
          loading={googleLoading}
          disabled={isLoading}
          icon={<GoogleIcon size={18} />}
          backgroundColor="#FFFFFF"
          textColor="#0D0D0D"
        />
        <View style={styles.hairline} />
        <Button
          label="Continue with Email"
          onPress={onEmail}
          disabled={isLoading}
          variant="outline"
          icon={<Ionicons name="mail-outline" size={18} color="#FFFFFF" />}
          textColor="#FFFFFF"
          borderColor="rgba(255,255,255,0.5)"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.lg,
  },
  buttons: {
    gap: Spacing.sm,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: Spacing.base,
  },
});
