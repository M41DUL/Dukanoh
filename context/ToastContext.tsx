import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastState {
  message: string;
  variant: ToastVariant;
  id: number;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// Module-level escape hatch so non-React code (e.g. lib/mutations.ts
// helpers, lib/queryClient.ts defaults) can post toasts. Only works after
// ToastProvider has mounted; before mount calls are silently dropped.
let globalShow: ToastContextValue['show'] | null = null;

export function showToast(message: string, variant: ToastVariant = 'info'): void {
  globalShow?.(message, variant);
}

const TOAST_DURATION_MS = 4000;
let nextId = 0;

/**
 * Centralised toast surface for non-blocking user-facing messages.
 *
 * Use cases:
 *   - Mutation errors that aren't worth interrupting with Alert.alert
 *   - Background success notifications ("Listing published")
 *   - System events (network reconnected, etc.)
 *
 * Reserve Alert.alert for confirm-destructive flows ("Delete listing?")
 * where blocking input is genuinely required. New code should use
 * useToast for ambient feedback; existing Alert.alert error call sites
 * can be migrated opportunistically.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      setToast({ message, variant, id: ++nextId });

      opacity.stopAnimation();
      translateY.stopAnimation();
      opacity.setValue(0);
      translateY.setValue(20);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      dismissTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) setToast(null);
        });
      }, TOAST_DURATION_MS);
    },
    [opacity, translateY],
  );

  useEffect(() => {
    globalShow = show;
    return () => {
      globalShow = null;
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [show]);

  const palette =
    toast?.variant === 'error'
      ? { bg: colors.error, fg: '#FFFFFF' }
      : toast?.variant === 'success'
        ? { bg: '#10B981', fg: '#FFFFFF' }
        : { bg: colors.surface, fg: colors.textPrimary };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.container,
            {
              bottom: insets.bottom + Spacing.xl,
              backgroundColor: palette.bg,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text style={[styles.text, { color: palette.fg }]}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.medium,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  text: {
    ...Typography.body,
    ...FontFamily.medium,
    textAlign: 'center',
  },
});
