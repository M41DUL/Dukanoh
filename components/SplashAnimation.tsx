import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, ClipPath, Rect, Defs } from 'react-native-svg';
import { lightColors, Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { DukanohLogo } from './DukanohLogo';

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

  // Bottom sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  const openSheet = () => {
    setSheetVisible(true);
    Animated.parallel([
      Animated.spring(sheetY, { toValue: 0, speed: 16, bounciness: 4, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.spring(sheetY, { toValue: SCREEN_HEIGHT, speed: 20, bounciness: 0, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setSheetVisible(false));
  };

  const handleEmailSignUp = () => {
    closeSheet();
    dismiss(() => { onJoin(); onDone(); });
  };

  const handleComingSoon = (provider: string) => {
    Alert.alert(`${provider} sign-in`, 'Coming soon!');
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
            <TouchableOpacity style={styles.joinBtn} onPress={openSheet} activeOpacity={0.85}>
              <Text style={styles.joinBtnText}>Join today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.85}>
              <Text style={styles.signInBtnText}>Already have an account</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Bottom sheet */}
      {sheetVisible && (
        <>
          {/* Backdrop — tappable to close */}
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeSheet}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
          </TouchableOpacity>

          {/* Sheet */}
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={closeSheet} hitSlop={8}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            <Text style={styles.sheetTitle}>Let's get started</Text>
            <Text style={styles.sheetSubtitle}>Create your account to explore more.</Text>

            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.appleBtn} onPress={() => handleComingSoon('Apple')} activeOpacity={0.85}>
                <Ionicons name="logo-apple" size={18} color="#FFFFFF" style={styles.btnIcon} />
                <Text style={styles.appleBtnText}>Continue with Apple</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.googleBtn} onPress={() => handleComingSoon('Google')} activeOpacity={0.85}>
                <View style={styles.btnIcon}><GoogleIcon size={18} /></View>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>
              <View style={styles.hairline} />
              <TouchableOpacity style={styles.emailBtn} onPress={handleEmailSignUp} activeOpacity={0.85}>
                <Ionicons name="mail-outline" size={18} color={lightColors.secondary} style={styles.btnIcon} />
                <Text style={styles.emailBtnText}>Continue with Email</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}
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
  // Bottom sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: lightColors.primary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xl * 1.5,
    paddingBottom: 64,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.base,
    right: Spacing.base,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 28,
    fontFamily: FontFamily.black,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  sheetSubtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.xl * 1.5,
  },
  sheetButtons: {
    gap: Spacing.sm,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: Spacing.xs,
  },
  btnIcon: {
    marginRight: 8,
  },
  appleBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  googleBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: '#0D0D0D',
    letterSpacing: 0.2,
  },
  emailBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: lightColors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.semibold,
    color: lightColors.secondary,
    letterSpacing: 0.2,
  },
});
