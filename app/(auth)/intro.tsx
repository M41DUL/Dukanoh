import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { lightColors, Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { Button } from '@/components/Button';
import {
  LOGO_FINAL_W,
  LOGO_FINAL_H,
  LOGO_TRANSLATE_X,
  LOGO_TRANSLATE_Y,
} from '@/constants/logoLayout';
import { DukanohLogo } from '@/components/DukanohLogo';
import { AuthSheet } from '@/components/AuthSheet';

const LINE_HEIGHT = 50;
const LINES = ['Your Fits.', 'Your Culture.', 'On Repeat.'];

const BADGES: { label: string; left: `${number}%`; top: `${number}%`; accent: boolean }[] = [
  { label: 'Eid',       left: '6%',  top: '8%',  accent: true  },
  { label: 'Wedding',   left: '54%', top: '6%',  accent: false },
  { label: 'Festive',   left: '20%', top: '26%', accent: false },
  { label: 'Partywear', left: '50%', top: '28%', accent: true  },
  { label: 'Mehndi',    left: '7%',  top: '46%', accent: false },
  { label: 'Achkan',    left: '60%', top: '48%', accent: false },
  { label: 'Diwali',    left: '30%', top: '16%', accent: true  },
  { label: 'Formal',    left: '65%', top: '18%', accent: false },
];

export default function IntroScreen() {
  const [sheetMode, setSheetMode] = useState<'join' | 'login' | null>(null);
  const isFocused = useIsFocused();
  const focusedRef = useRef(true);
  useEffect(() => { focusedRef.current = isFocused; }, [isFocused]);

  // Animated values for entrance
  const logoMarkOpacity = useRef(new Animated.Value(0)).current;
  const logoMarkY = useRef(new Animated.Value(-250)).current;
  const logoBottomY = useRef(new Animated.Value(250)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(20)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

  // Per-line slide-up reveal
  const lineAnims = useRef(LINES.map(() => new Animated.Value(LINE_HEIGHT))).current;
  const lineOpacities = useRef(LINES.map(() => new Animated.Value(0))).current;

  // Per-badge opacity + scale
  const badgeOpacities = useRef(BADGES.map(() => new Animated.Value(0))).current;
  const badgeScales = useRef(BADGES.map(() => new Animated.Value(0))).current;

  const mountedRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const startLineReveal = (onComplete?: () => void) => {
    Animated.stagger(
      600,
      lineAnims.map((anim, i) =>
        Animated.parallel([
          Animated.timing(anim, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(lineOpacities[i], { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      )
    ).start(() => onComplete?.());
  };

  const startBadges = () => {
    badgesStartedRef.current = true;
    BADGES.forEach((_, i) => {
      const opacity = badgeOpacities[i];
      const scale = badgeScales[i];

      const runCycle = () => {
        if (!mountedRef.current || !focusedRef.current) return;
        const holdDuration = 1400 + Math.random() * 1600;

        scale.setValue(0);
        opacity.setValue(0);

        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 350, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          ]),
          Animated.delay(holdDuration),
          Animated.parallel([
            Animated.timing(scale, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
          ]),
        ]).start(({ finished }) => {
          if (!finished || !mountedRef.current || !focusedRef.current) return;
          setTimeout(runCycle, 600 + Math.random() * 1800);
        });
      };

      setTimeout(runCycle, i * 350 + Math.random() * 700);
    });
  };

  const handleEmail = () => {
    const isJoin = sheetMode === 'join';
    router.push(isJoin ? '/(auth)/signup' : '/(auth)/login');
    setSheetMode(null);
  };

  // Entrance animation on mount
  useEffect(() => {
    // Slide both logos into position simultaneously
    logoMarkOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(logoBottomY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoMarkY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Start content before logos finish
    const contentTimer = setTimeout(() => {
      const animIn = (opacity: Animated.Value, y: Animated.Value) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: 300, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
        ]);
      Animated.stagger(80, [
        animIn(taglineOpacity, taglineY),
        animIn(ctaOpacity, ctaY),
      ]).start(() => {
        const lineTimer = setTimeout(() => startLineReveal(startBadges), 100);
        timersRef.current.push(lineTimer);
      });
    }, 300);
    timersRef.current.push(contentTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time entrance animation — animated values are stable refs

  // Restart badge animations when screen regains focus
  const badgesStartedRef = useRef(false);
  useEffect(() => {
    if (isFocused && badgesStartedRef.current) {
      startBadges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]); // startBadges is stable — defined in component but depends only on stable refs

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Big logo at bottom */}
      <Animated.View
        style={[styles.logoContainer, { transform: [{ translateY: logoBottomY }] }]}
      >
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
      </Animated.View>

      <View style={styles.introContent}>
        {/* Small wordmark top-left */}
        <Animated.View style={[styles.introHeader, { opacity: logoMarkOpacity, transform: [{ translateY: logoMarkY }] }]}>
          <DukanohLogo width={80} height={14} color={lightColors.secondary} />
        </Animated.View>

        {/* Hero card */}
        <Animated.View style={[styles.heroCard, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
          {BADGES.map((badge, i) => (
            <Animated.View
              key={badge.label}
              style={[
                styles.badge,
                badge.accent ? styles.badgeAccent : styles.badgeMuted,
                {
                  left: badge.left,
                  top: badge.top,
                  opacity: badgeOpacities[i],
                  transform: [{ scale: badgeScales[i] }],
                },
              ]}
            >
              <Text style={[styles.badgeText, badge.accent && styles.badgeTextAccent]}>
                {badge.label}
              </Text>
            </Animated.View>
          ))}

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

        {/* CTAs */}
        <Animated.View style={[styles.ctaSection, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          <Button
            label="Join today"
            variant="secondary"
            onPress={() => setSheetMode('join')}
          />
          <Button
            label="Sign in"
            variant="outline"
            onPress={() => setSheetMode('login')}
            borderColor="rgba(255,255,255,0.5)"
            textColor="#FFFFFF"
          />
        </Animated.View>
      </View>

      <AuthSheet
        visible={sheetMode !== null}
        mode={sheetMode ?? 'join'}
        onClose={() => setSheetMode(null)}
        onEmail={handleEmail}
      />
    </View>
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
  introContent: {
    flex: 1,
    paddingHorizontal: Spacing.base,
  },
  introHeader: {
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
  badge: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  badgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeAccent: {
    backgroundColor: 'rgba(199,247,94,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(199,247,94,0.35)',
  },
  badgeText: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },
  badgeTextAccent: {
    color: lightColors.secondary,
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
    fontSize: 38,
    fontFamily: FontFamily.black,
    color: '#FFFFFF',
    lineHeight: LINE_HEIGHT,
  },
  ctaSection: {
    gap: Spacing.sm,
    paddingBottom: LOGO_FINAL_H - 60 + Spacing.xl + (Platform.OS === 'android' ? 40 : 0),
  },
});
