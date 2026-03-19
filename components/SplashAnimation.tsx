import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { lightColors } from '@/constants/theme';
import { LOGO_FINAL_W, LOGO_FINAL_H, LOGO_SMALL_SCALE } from '@/constants/logoLayout';
import { DukanohLogo } from './DukanohLogo';

interface SplashAnimationProps {
  onDone: () => void;
}

export function SplashAnimation({ onDone }: SplashAnimationProps) {
  const logoScale = useRef(new Animated.Value(0)).current;

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
        }).start(() => onDone());
      }, 500);
    });
  }, []);

  return (
    <Animated.View style={styles.container}>
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
