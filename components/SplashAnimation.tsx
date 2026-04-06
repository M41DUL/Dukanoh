import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { lightColors } from '@/constants/theme';
import { LOGO_FINAL_W, LOGO_FINAL_H, LOGO_SMALL_SCALE } from '@/constants/logoLayout';
import { DukanohLogo } from './DukanohLogo';

interface SplashAnimationProps {
  /** Called when logo animation finishes — triggers route navigation */
  onAnimationDone: () => void;
  /** When true, splash fades out (set after route has mounted) */
  fadeOut: boolean;
  /** Called after fade-out completes — safe to unmount */
  onFadeOutDone: () => void;
}

export function SplashAnimation({ onAnimationDone, fadeOut, onFadeOutDone }: SplashAnimationProps) {
  const logoScale = useRef(new Animated.Value(0.01)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Scale up
    Animated.spring(logoScale, {
      toValue: LOGO_SMALL_SCALE,
      speed: 8,
      bounciness: 6,
      useNativeDriver: true,
    }).start(() => {
      // Hold briefly
      setTimeout(() => {
        // Scale back down
        Animated.timing(logoScale, {
          toValue: 0.01,
          duration: 350,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => onAnimationDone());
      }, 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time mount animation — logoScale is a stable ref, onAnimationDone is stable at call site

  // Fade out when told to
  useEffect(() => {
    if (fadeOut) {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onFadeOutDone());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fadeOut]); // containerOpacity is a stable ref, onFadeOutDone is stable at call site

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.View style={{ transform: [{ scale: logoScale }] }}>
        <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
      </Animated.View>
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
});
