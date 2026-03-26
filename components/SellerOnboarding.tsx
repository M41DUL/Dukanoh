import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors, Spacing, BorderRadius, FontFamily, Typography } from '@/constants/theme';
import {
  LOGO_FINAL_W,
  LOGO_FINAL_H,
  LOGO_TRANSLATE_X,
  LOGO_TRANSLATE_Y,
} from '@/constants/logoLayout';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { supabase } from '@/lib/supabase';

const LINE_HEIGHT = 44;
const LINES = ['Snap, upload', 'and start earning', 'in minutes.'];

interface SellerOnboardingProps {
  userId: string;
  onActivated: () => void;
}

export function SellerOnboarding({ userId, onActivated }: SellerOnboardingProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Animated values
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroY = useRef(new Animated.Value(20)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

  const lineAnims = useRef(LINES.map(() => new Animated.Value(LINE_HEIGHT))).current;
  const lineOpacities = useRef(LINES.map(() => new Animated.Value(0))).current;

  const mountedRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const startLineReveal = () => {
    Animated.stagger(
      500,
      lineAnims.map((anim, i) =>
        Animated.parallel([
          Animated.timing(anim, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(lineOpacities[i], { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      )
    ).start();
  };

  useEffect(() => {
    const animIn = (opacity: Animated.Value, y: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 300, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
      ]);

    Animated.stagger(80, [
      animIn(heroOpacity, heroY),
      animIn(ctaOpacity, ctaY),
    ]).start(() => {
      const lineTimer = setTimeout(startLineReveal, 100);
      timersRef.current.push(lineTimer);
    });
  }, []);

  const handleSubmit = async () => {
    if (!code.trim()) { setError('Please enter your invite code'); return; }
    Keyboard.dismiss();
    setLoading(true);
    setError('');

    try {
      const { data: activated, error: rpcError } = await supabase.rpc('activate_seller', {
        p_code: code.trim().toUpperCase(),
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;

      if (!activated) {
        setError('Invalid or already used invite code');
        return;
      }

      setConfirmed(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <ScreenWrapper>
        <View style={styles.confirmedContainer}>
          <View style={styles.confirmedIcon}>
            <Ionicons name="checkmark" size={40} color={lightColors.primary} />
          </View>
          <Text style={styles.confirmedTitle}>You're in!</Text>
          <Text style={styles.confirmedSubtitle}>
            Welcome to the Dukanoh seller community. Start listing your items and reach buyers across the community.
          </Text>
          <Button
            label="Start selling"
            onPress={onActivated}
            style={styles.confirmedCta}
          />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Big logo at bottom */}
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

      <View style={styles.content}>
        {/* Header: wordmark */}
        <View style={styles.header}>
          <DukanohLogo width={80} height={14} color={lightColors.secondary} />
        </View>

        {/* Hero card */}
        <Animated.View style={[styles.heroCard, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>
          <View style={styles.linesContainer}>
            {LINES.map((line, i) => (
              <View key={i} style={styles.lineClip}>
                <Animated.Text
                  style={[styles.tagline, { opacity: lineOpacities[i], transform: [{ translateY: lineAnims[i] }] }]}
                >
                  {line}
                </Animated.Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* CTA section */}
        <Animated.View style={[styles.ctaSection, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          <Input
            placeholder="Invite code"
            value={code}
            onChangeText={text => { setCode(text); setError(''); }}
            autoCapitalize="characters"
            autoCorrect={false}
            error={error}
            inputContainerStyle={styles.inputContainer}
            placeholderColor="rgba(255,255,255,0.4)"
            style={styles.inputText}
            hintColor="rgba(255,255,255,0.5)"
          />
          <TouchableOpacity
            style={[styles.submitBtn, !code.trim() && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={!code.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel="List my first item"
          >
            {loading ? (
              <ActivityIndicator color="#0D0D0D" />
            ) : (
              <Text style={[styles.submitBtnText, !code.trim() && styles.submitBtnTextDisabled]}>
                List my first item
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.terms}>
            By continuing you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => {/* TODO: link to terms */}}>
              Terms of Service
            </Text>
          </Text>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.primary,
  },
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
  header: {
    marginTop: 72,
    marginBottom: Spacing.base,
    alignItems: 'flex-start',
  },
  heroCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#1E1C8A',
    justifyContent: 'flex-end',
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  linesContainer: {
    overflow: 'hidden',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  lineClip: {
    height: LINE_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  tagline: {
    fontSize: 34,
    fontFamily: FontFamily.black,
    color: '#FFFFFF',
    lineHeight: LINE_HEIGHT,
  },
  ctaSection: {
    gap: Spacing.sm,
    paddingBottom: LOGO_FINAL_H - 60 + Spacing.xl,
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.medium,
  },
  inputText: {
    color: '#FFFFFF',
  },
  terms: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  termsLink: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  submitBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: lightColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: '#0D0D0D',
    letterSpacing: 0.2,
  },
  submitBtnTextDisabled: {
    opacity: 0.6,
  },
  confirmedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
  },
  confirmedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  confirmedTitle: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    color: '#0D0D0D',
    textAlign: 'center',
  },
  confirmedSubtitle: {
    ...Typography.body,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmedCta: {
    alignSelf: 'stretch',
    marginTop: Spacing.xl,
  },
});
