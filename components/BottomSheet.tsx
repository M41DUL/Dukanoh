import React, { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor?: string;
  handleColor?: string;
}

export function BottomSheet({ visible, onClose, children, backgroundColor, handleColor }: BottomSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(800)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(sheetAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    } else {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetAnim, { toValue: 800, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start();
    });

    const hide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start();
    });

    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[styles.sheetOuter, { bottom: keyboardOffset }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: backgroundColor ?? colors.background,
              paddingBottom: insets.bottom + Spacing.xl,
              transform: [{ translateY: sheetAnim }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: handleColor ?? colors.border }]} />
          {children}
        </Animated.View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 100,
  },
  sheetOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 101,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
});
