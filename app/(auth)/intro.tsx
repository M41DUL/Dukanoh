import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { lightColors, Spacing, BorderRadius, FontFamily } from '@/constants/theme';
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
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startLineReveal = (onComplete?: () => void) => {
    Animated.stagger(
      600,
      lineAnims.map((anim, i) =>
        Animated.parallel([
          Animated.spring(anim, { toValue: 0, speed: 18, bounciness: 0, useNativeDriver: true }),
          Animated.timing(lineOpacities[i], { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      )
    ).start(() => onComplete?.());
  };

  const startBadges = () => {
    BADGES.forEach((_, i) => {
      const opacity = badgeOpacities[i];
      const scale = badgeScales[i];

      const runCycle = () => {
        if (!mountedRef.current) return;
        const holdDuration = 1400 + Math.random() * 1600;

        scale.setValue(0);
        opacity.setValue(0);

        Animated.sequence([
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, speed: 10, bounciness: 6, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          ]),
          Animated.delay(holdDuration),
          Animated.parallel([
            Animated.timing(scale, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
          ]),
        ]).start(({ finished }) => {
          if (!finished || !mountedRef.current) return;
          setTimeout(runCycle, 600 + Math.random() * 1800);
        });
      };

      setTimeout(runCycle, i * 350 + Math.random() * 700);
    });
  };

  const handleEmail = () => {
    const isJoin = sheetMode === 'join';
    setSheetMode(null);
    setTimeout(() => {
      router.push(isJoin ? '/(auth)/signup' : '/(auth)/login');
    }, 50);
  };

  // Entrance animation on mount
  useEffect(() => {
    // Slide both logos into position simultaneously
    logoMarkOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(logoBottomY, { toValue: 0, speed: 14, bounciness: 0, useNativeDriver: true }),
      Animated.spring(logoMarkY, { toValue: 0, speed: 14, bounciness: 0, useNativeDriver: true }),
    ]).start();

    // Start content before logos finish
    setTimeout(() => {
      const animIn = (opacity: Animated.Value, y: Animated.Value) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(y, { toValue: 0, speed: 22, bounciness: 3, useNativeDriver: true }),
        ]);
      Animated.stagger(80, [
        animIn(taglineOpacity, taglineY),
        animIn(ctaOpacity, ctaY),
      ]).start(() => {
        setTimeout(() => startLineReveal(startBadges), 100);
      });
    }, 300);
  }, []);

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
          <TouchableOpacity style={styles.joinBtn} onPress={() => setSheetMode('join')} activeOpacity={0.85}>
            <Text style={styles.joinBtnText}>Join today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signInBtn} onPress={() => setSheetMode('login')} activeOpacity={0.85}>
            <Text style={styles.signInBtnText}>Already have an account</Text>
          </TouchableOpacity>
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
    paddingBottom: LOGO_FINAL_H - 60 + Spacing.xl,
  },
  joinBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: lightColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: '#0D0D0D',
    letterSpacing: 0.2,
  },
  signInBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
