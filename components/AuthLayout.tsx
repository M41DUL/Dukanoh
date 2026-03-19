import React from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { DukanohLogo } from './DukanohLogo';
import { lightColors, Spacing } from '@/constants/theme';
import {
  LOGO_FINAL_W,
  LOGO_FINAL_H,
  LOGO_TRANSLATE_X,
  LOGO_TRANSLATE_Y,
} from '@/constants/logoLayout';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Big logo at bottom — matches intro screen position */}
      <View style={styles.logoContainer}>
        <View
          style={{
            transform: [
              { translateX: LOGO_TRANSLATE_X },
              { translateY: LOGO_TRANSLATE_Y },
            ],
          }}
        >
          <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={[styles.content, { paddingTop: insets.top + Spacing.base }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Push content down */}
        <View style={styles.flex} />

        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.primary,
  },
  flex: { flex: 1 },
  logoContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingBottom: LOGO_FINAL_H - 60 + Spacing.xl,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
});
