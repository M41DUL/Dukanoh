import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { lightColors } from '@/constants/theme';
import { DukanohLogo } from './DukanohLogo';

interface SplashAnimationProps {
  onDone: () => void;
}

export function SplashAnimation({ onDone }: SplashAnimationProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Fade in + grow over 2s
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Hold for 2s, then fade out the whole screen
      setTimeout(() => {
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => onDone());
      }, 2000);
    });
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <DukanohLogo width={200} height={36} />
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
