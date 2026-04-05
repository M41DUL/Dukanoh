import React from 'react';
import {
  View,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
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
  /** When true, back button shows a discard confirmation */
  isDirty?: boolean;
}

export function AuthLayout({ children, isDirty }: AuthLayoutProps) {
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (isDirty) {
      Alert.alert(
        'Discard changes?',
        "You'll lose what you've entered.",
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  };

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

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={[styles.content, { paddingTop: insets.top + Spacing.base }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Back */}
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Push content down */}
          <View style={styles.flex} />

          {children}

          {/* Match intro screen spacing above the logo */}
          <View style={styles.logoSpacer} />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
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
  },
  logoSpacer: {
    height: LOGO_FINAL_H - 60 + Spacing.xl + (Platform.OS === 'android' ? 40 : 0),
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
});
