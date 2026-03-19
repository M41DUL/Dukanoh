import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { lightColors, Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { DukanohLogo } from './DukanohLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Render the logo at its FINAL large size so SVG stays crisp when we scale up.
// Phase 1 scales it DOWN to appear small; phase 2b springs back to 1.0 (full size).
const LOGO_FINAL_W = 1300;
const LOGO_FINAL_H = 234;
const LOGO_SMALL_SCALE = 200 / LOGO_FINAL_W; // ≈ 0.154 — appears 200px wide

// 'u' (second letter) spans x≈30.31–55.56 in the 200-unit SVG viewBox.
// Scale to logo pixels and offset so 'u' is horizontally centred on screen.
const U_CENTER_SCALED = ((30.3115 + 55.5596) / 2) * (LOGO_FINAL_W / 200); // ≈ 279px
const LOGO_TRANSLATE_X = LOGO_FINAL_W / 2 - U_CENTER_SCALED; // ≈ 371
const LOGO_TRANSLATE_Y = (SCREEN_HEIGHT + 60 - LOGO_FINAL_H / 2) - SCREEN_HEIGHT / 2;

const SCALED_H = LOGO_FINAL_H; // used for layout below

interface SplashAnimationProps {
  hasSession: boolean;
  onDone: () => void;
  onJoin: () => void;
  onSignIn: () => void;
}

export function SplashAnimation({ hasSession, onDone, onJoin, onSignIn }: SplashAnimationProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  // Start scaled down (appears 200px wide), animate to LOGO_SMALL_SCALE in phase 1,
  // then spring to 1.0 in phase 2b — SVG renders at full res throughout.
  const logoScale = useRef(new Animated.Value(LOGO_SMALL_SCALE * 0.85)).current;
  const logoTranslateX = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoMarkOpacity = useRef(new Animated.Value(0)).current;
  const logoMarkY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(20)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(20)).current;

  const dismiss = (callback: () => void) => {
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => callback());
  };

  const handleJoin = () => {
    onJoin();
    dismiss(onDone);
  };

  const handleSignIn = () => {
    onSignIn();
    dismiss(onDone);
  };

  useEffect(() => {
    // Phase 1: logo fades in + grows — snappy 700ms
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: LOGO_SMALL_SCALE,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold 0.8s, then phase 2
      setTimeout(() => {
        if (hasSession) {
          // Phase 2a: fade out → done
          Animated.timing(containerOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => onDone());
        } else {
          // Phase 2b: logo springs to bottom, then content slides up + fades in
          Animated.parallel([
            Animated.spring(logoScale, {
              toValue: 1.0,
              speed: 20,
              bounciness: 0,
              useNativeDriver: true,
            }),
            Animated.spring(logoTranslateX, {
              toValue: LOGO_TRANSLATE_X,
              speed: 20,
              bounciness: 0,
              useNativeDriver: true,
            }),
            Animated.spring(logoTranslateY, {
              toValue: LOGO_TRANSLATE_Y,
              speed: 20,
              bounciness: 0,
              useNativeDriver: true,
            }),
          ]).start(() => {
            // Stagger each section in after logo settles
            const animIn = (opacity: Animated.Value, y: Animated.Value) =>
              Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.spring(y, { toValue: 0, speed: 22, bounciness: 3, useNativeDriver: true }),
              ]);

            Animated.stagger(80, [
              animIn(logoMarkOpacity, logoMarkY),
              animIn(taglineOpacity, taglineY),
              animIn(ctaOpacity, ctaY),
            ]).start();
          });
        }
      }, 800);
    });
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Centred logo — morphs to bottom-left in phase 2b */}
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [
            { translateX: logoTranslateX },
            { translateY: logoTranslateY },
            { scale: logoScale },
          ],
        }}
      >
        <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
      </Animated.View>

      {/* Intro content — only shown when no session */}
      {!hasSession && (
        <View style={styles.introContent}>
          {/* Small wordmark — top left */}
          <Animated.View style={[styles.introHeader, { opacity: logoMarkOpacity, transform: [{ translateY: logoMarkY }] }]}>
            <DukanohLogo width={80} height={14} color={lightColors.secondary} />
          </Animated.View>

          {/* Hero card */}
          <Animated.View style={[styles.heroCard, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
            <Text style={styles.tagline}>Your Fits.{'\n'}Your Culture.{'\n'}On Repeat.</Text>
          </Animated.View>

          {/* CTAs */}
          <Animated.View style={[styles.ctaSection, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
            <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} activeOpacity={0.85}>
              <Text style={styles.joinBtnText}>Join today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.85}>
              <Text style={styles.signInBtnText}>Sign in to my account</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
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
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 24,
    justifyContent: 'flex-end',
    padding: Spacing.xl,
    marginBottom: Spacing.base,
  },
  tagline: {
    fontSize: 38,
    fontFamily: FontFamily.black,
    color: '#FFFFFF',
    lineHeight: 46,
  },
  ctaSection: {
    gap: Spacing.sm,
    // Buttons sit above the visible portion of the large logo (174px) + breathing room
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
