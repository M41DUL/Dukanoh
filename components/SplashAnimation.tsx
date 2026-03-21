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
  const logoScale = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Scale up from 0
    Animated.timing(logoScale, {
      toValue: LOGO_SMALL_SCALE,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      // Hold briefly
      setTimeout(() => {
        // Scale back down to 0
        Animated.timing(logoScale, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => onAnimationDone());
      }, 500);
    });
  }, []);

  // Fade out when told to
  useEffect(() => {
    if (fadeOut) {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onFadeOutDone());
    }
  }, [fadeOut]);

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
