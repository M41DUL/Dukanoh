import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { lightColors, Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { DukanohLogo } from './DukanohLogo';
import { JoinSheet } from './JoinSheet';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LOGO_FINAL_W = 1300;
const LOGO_FINAL_H = 234;
const LOGO_SMALL_SCALE = 200 / LOGO_FINAL_W;

const U_CENTER_SCALED = ((30.3115 + 55.5596) / 2) * (LOGO_FINAL_W / 200);
const LOGO_TRANSLATE_X = LOGO_FINAL_W / 2 - U_CENTER_SCALED;
const LOGO_TRANSLATE_Y = (SCREEN_HEIGHT + 60 - LOGO_FINAL_H / 2) - SCREEN_HEIGHT / 2;

const SCALED_H = LOGO_FINAL_H;
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


interface SplashAnimationProps {
  hasSession: boolean;
  onDone: () => void;
  onJoin: () => void;
  onSignIn: () => void;
}

export function SplashAnimation({ hasSession, onDone, onJoin, onSignIn }: SplashAnimationProps) {
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoTranslateX = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoMarkOpacity = useRef(new Animated.Value(0)).current;
  const logoMarkY = useRef(new Animated.Value(-250)).current;
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

  const [sheetVisible, setSheetVisible] = useState(false);

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

  const dismiss = (callback: () => void) => {
    Animated.timing(containerOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      .start(() => callback());
  };

  const handleEmailSignUp = () => {
    setSheetVisible(false);
    dismiss(() => { onJoin(); onDone(); });
  };

  const handleSignIn = () => { onSignIn(); dismiss(onDone); };

  // Main sequence
  useEffect(() => {
    Animated.timing(logoScale, { toValue: LOGO_SMALL_SCALE, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true })
      .start(() => {
        setTimeout(() => {
          Animated.timing(logoScale, { toValue: 0, duration: 400, easing: Easing.in(Easing.ease), useNativeDriver: true })
            .start(() => {
              if (hasSession) {
                onDone();
              } else {
                logoTranslateX.setValue(LOGO_TRANSLATE_X);
                logoTranslateY.setValue(SCREEN_HEIGHT);
                logoScale.setValue(1.0);
                logoMarkOpacity.setValue(1);

                Animated.parallel([
                  Animated.spring(logoTranslateY, { toValue: LOGO_TRANSLATE_Y, speed: 14, bounciness: 0, useNativeDriver: true }),
                  Animated.spring(logoMarkY, { toValue: 0, speed: 14, bounciness: 0, useNativeDriver: true }),
                ]).start();

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
              }
            });
        }, 500);
      });
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Logo — morphs to bottom-left */}
      <Animated.View
        style={{
          transform: [
            { translateX: logoTranslateX },
            { translateY: logoTranslateY },
            { scale: logoScale },
          ],
        }}
      >
        <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
      </Animated.View>

      {!hasSession && (
        <View style={styles.introContent}>
          {/* Wordmark */}
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

            {/* Tagline — lines slide up */}
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
            <TouchableOpacity style={styles.joinBtn} onPress={() => setSheetVisible(true)} activeOpacity={0.85}>
              <Text style={styles.joinBtnText}>Join today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.85}>
              <Text style={styles.signInBtnText}>Already have an account</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      <JoinSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onEmail={handleEmailSignUp}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  introContent: {
    ...StyleSheet.absoluteFillObject,
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
    paddingBottom: SCALED_H - 60 + Spacing.xl,
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
