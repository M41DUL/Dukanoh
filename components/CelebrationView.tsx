import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Spacing, BorderRadius, FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

interface CelebrationAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
}

interface Props {
  icon: IoniconsName;
  title: string;
  subtitle?: string;
  actions: CelebrationAction[];
  iconColor?: string;
  textColor?: string;
  subtitleColor?: string;
}

export function CelebrationView({ icon, title, subtitle, actions, iconColor, textColor, subtitleColor }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const resolvedIconColor = iconColor ?? colors.primary;
  const resolvedTextColor = textColor ?? colors.textPrimary;
  const resolvedSubtitleColor = subtitleColor ?? colors.textSecondary;

  const iconScale = useSharedValue(0);
  const iconOpacity = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleY = useSharedValue(20);
  const actionsOpacity = useSharedValue(0);
  const actionsY = useSharedValue(20);

   
  useEffect(() => {
    iconScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 180 }));
    iconOpacity.value = withDelay(200, withTiming(1, { duration: 250 }));

    ringScale.value = withDelay(300, withRepeat(
      withSequence(
        withTiming(1.65, { duration: 750, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ), 3, false,
    ));
    ringOpacity.value = withDelay(300, withRepeat(
      withSequence(
        withTiming(0, { duration: 750 }),
        withTiming(0.45, { duration: 0 }),
      ), 3, false,
    ));

    titleOpacity.value = withDelay(600, withTiming(1, { duration: 450 }));
    titleY.value = withDelay(600, withSpring(0, { damping: 14, stiffness: 120 }));

    subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 450 }));
    subtitleY.value = withDelay(800, withSpring(0, { damping: 14, stiffness: 120 }));

    actionsOpacity.value = withDelay(1000, withTiming(1, { duration: 400 }));
    actionsY.value = withDelay(1000, withSpring(0, { damping: 14, stiffness: 120 }));
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: iconOpacity.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleY.value }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: actionsOpacity.value,
    transform: [{ translateY: actionsY.value }],
  }));

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + Spacing['2xl'] }]}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.ring, { borderColor: resolvedIconColor }, ringStyle]} />
        <Animated.View style={[styles.iconCircle, { backgroundColor: resolvedIconColor + '18' }, iconStyle]}>
          <Ionicons name={icon} size={56} color={resolvedIconColor} />
        </Animated.View>
      </View>

      <Animated.Text style={[styles.title, { color: resolvedTextColor }, titleStyle]}>
        {title}
      </Animated.Text>

      {subtitle ? (
        <Animated.Text style={[styles.subtitle, { color: resolvedSubtitleColor }, subtitleStyle]}>
          {subtitle}
        </Animated.Text>
      ) : null}

      <Animated.View style={[styles.actions, actionsStyle]}>
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            onPress={action.onPress}
            variant={action.variant === 'outline' ? 'outline' : undefined}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  ring: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  actions: {
    width: '100%',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
});
