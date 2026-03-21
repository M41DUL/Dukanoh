import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import {
  Typography,
  Spacing,
  FontFamily,
  Categories,
  ColorTokens,
} from '@/constants/theme';
import {
  LOGO_FINAL_W,
  LOGO_FINAL_H,
  LOGO_TRANSLATE_X,
  LOGO_TRANSLATE_Y,
} from '@/constants/logoLayout';
import { useThemeColors } from '@/hooks/useThemeColors';
import { DukanohLogo } from '@/components/DukanohLogo';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';

const BASE_WIDTH = 390; // iPhone 14 baseline for scaling
const ONBOARDING_CATEGORIES = Categories.filter((c) => c !== 'All');

// ─── Bubble layout data ─────────────────────────────────────
type BubbleLayout = { left: number; top: number; size: number };

const CATEGORY_LAYOUT: BubbleLayout[] = [
  // Row 1
  { left: 0.02, top: 0.00, size: 78 },   // Men (short)
  { left: 0.30, top: 0.02, size: 96 },   // Women (short)
  { left: 0.62, top: 0.00, size: 110 },  // Casualwear (long)
  // Row 2
  { left: 0.05, top: 0.24, size: 104 },  // Partywear (long)
  { left: 0.42, top: 0.22, size: 82 },   // Festive (medium)
  { left: 0.70, top: 0.24, size: 74 },   // Formal (medium)
  // Row 3
  { left: 0.02, top: 0.48, size: 86 },   // Achkan (medium)
  { left: 0.34, top: 0.46, size: 98 },   // Wedding (medium)
  // Row 4
  { left: 0.06, top: 0.72, size: 114 },  // Pathani Suit (long)
  { left: 0.48, top: 0.74, size: 76 },   // Shoes (short)
];

// Pre-compute centre-out distances for staggered entrance
const CENTRE = { x: 0.45, y: 0.35 };
const CATEGORY_DISTANCES = CATEGORY_LAYOUT.map((l) =>
  Math.sqrt((l.left - CENTRE.x) ** 2 + (l.top - CENTRE.y) ** 2),
);
const MAX_DIST = Math.max(...CATEGORY_DISTANCES);

// ─── Confetti particle ──────────────────────────────────────

const PARTICLE_COUNT = 6;
const PARTICLE_COLORS = ['#C7F75E', '#3735C5', '#FF6B6B', '#FFD93D', '#6BCB77', '#9B59B6'];

function ConfettiParticles({ fire, size }: { fire: boolean; size: number }) {
  const progressAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0)),
  ).current;
  const directions = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: 20 + Math.random() * 30,
    })),
  );

  useEffect(() => {
    if (!fire) return;
    directions.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: 20 + Math.random() * 30,
    }));
    progressAnims.forEach((p) => {
      p.setValue(0);
      Animated.timing(p, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [fire]);

  const centre = size / 2;

  return (
    <>
      {progressAnims.map((progress, i) => {
        const d = directions.current[i];
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: centre - 3,
              top: centre - 3,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
              opacity: progress.interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(d.angle) * d.distance],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(d.angle) * d.distance],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1.2, 0.4],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </>
  );
}

// ─── Animated bubble ────────────────────────────────────────

function Bubble({
  label,
  active,
  onPress,
  layout,
  index,
  animate,
  colors,
  areaHeight,
  screenWidth,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  layout: BubbleLayout;
  index: number;
  animate: boolean;
  colors: ColorTokens;
  areaHeight: number;
  screenWidth: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const float = useRef(new Animated.Value(0)).current;
  const colorAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const [fireConfetti, setFireConfetti] = useState(false);
  const wasActive = useRef(active);

  // Centre-out stagger: closer to centre = smaller delay
  const normDist = CATEGORY_DISTANCES[index] / MAX_DIST;
  const entranceDelay = 200 + normDist * 800;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 400,
      delay: entranceDelay,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, []);

  // Colour fade + confetti on selection, shrink on deselection
  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: active ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    if (active && !wasActive.current) {
      // Confetti on newly selected
      setFireConfetti(false);
      requestAnimationFrame(() => setFireConfetti(true));
    } else if (!active && wasActive.current) {
      // Subtle shrink-bounce on deselect
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }),
      ]).start();
    }
    wasActive.current = active;
  }, [active]);

  // Gentle float when selected
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: -4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(float, { toValue: 4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      float.stopAnimation();
      Animated.timing(float, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return () => { float.stopAnimation(); };
  }, [active]);

  const handlePress = async () => {
    await Haptics.selectionAsync();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        speed: 20,
        bounciness: 14,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const sizeScale = screenWidth / BASE_WIDTH;
  const containerWidth = screenWidth - Spacing.base * 2;
  const scaledSize = layout.size * sizeScale;
  const bubbleSize = active ? scaledSize * 1.06 : scaledSize;

  const bgColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.secondary],
  });
  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.secondary],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: layout.left * containerWidth,
        top: layout.top * areaHeight,
        opacity: entrance,
        transform: [
          { scale: Animated.multiply(entrance, scale) },
          { translateY: float },
        ],
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Animated.View
          style={[
            bubbleStyles.bubble,
            {
              width: bubbleSize,
              height: bubbleSize,
              borderRadius: bubbleSize / 2,
              backgroundColor: bgColor,
              borderColor: borderColor,
            },
          ]}
        >
          <Text
            style={[
              bubbleStyles.label,
              {
                color: active ? '#0D0D0D' : colors.textPrimary,
                fontSize: 13,
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <ConfettiParticles fire={fireConfetti} size={bubbleSize} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'visible',
  },
  label: {
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});

// ─── Shimmer overlay ────────────────────────────────────────

function ShimmerOverlay({ visible, screenWidth }: { visible: boolean; screenWidth: number }) {
  const shimmer = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 2,
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        transform: [
          {
            translateX: shimmer.interpolate({
              inputRange: [-1, 2],
              outputRange: [-screenWidth, screenWidth * 2],
            }),
          },
        ],
      }}
    >
      <View
        style={{
          width: screenWidth * 0.5,
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.7)',
          transform: [{ skewX: '-20deg' }],
        }}
      />
    </Animated.View>
  );
}

// ─── Main screen ────────────────────────────────────────────

export default function OnboardingScreen() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const isReset = reset === 'true';

  const [showWelcome, setShowWelcome] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [animateBubbles, setAnimateBubbles] = useState(false);
  const [bubbleAreaHeight, setBubbleAreaHeight] = useState(0);
  const [showShimmer, setShowShimmer] = useState(true);
  const [error, setError] = useState('');
  const { width: screenWidth } = useWindowDimensions();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Start bubble animation immediately, show welcome sheet after a short delay (skip on reset)
  useEffect(() => {
    requestAnimationFrame(() => setAnimateBubbles(true));
    if (!isReset) {
      const timer = setTimeout(() => setShowWelcome(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  // Stop shimmer once bubbles have finished entering
  useEffect(() => {
    const shimmerTimer = setTimeout(() => setShowShimmer(false), 2000);
    return () => clearTimeout(shimmerTimer);
  }, []);

  // Android hardware back — consume the event to prevent app exit
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => handler.remove();
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }, []);

  const saveAndNavigate = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 8000),
    );
    try {
      await Promise.race([
        (async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { error: updateError } = await supabase
              .from('users')
              .update({
                preferred_categories: selectedCategories,
                onboarding_completed: true,
              })
              .eq('id', user.id);
            if (updateError) throw updateError;
          }
          router.replace('/(tabs)/');
        })(),
        timeout,
      ]);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'timeout'
          ? 'Taking too long. Check your connection and try again.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const categoryCount = selectedCategories.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Big watermark logo at bottom */}
      <View style={styles.logoContainer}>
        <View
          style={{
            transform: [
              { translateX: LOGO_TRANSLATE_X },
              { translateY: LOGO_TRANSLATE_Y },
            ],
          }}
        >
          <DukanohLogo width={LOGO_FINAL_W} height={LOGO_FINAL_H} />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>What are you into?</Text>
        <Text style={styles.subtitle}>
          {categoryCount === 0
            ? 'Pick at least one'
            : categoryCount < 3
              ? `${categoryCount} selected`
              : `${categoryCount} selected \u2014 nice taste!`}
        </Text>
        <Text style={styles.hint}>These shape your home feed</Text>

        <View style={styles.heroCard}>
          <View style={styles.shimmerClip}>
            <ShimmerOverlay visible={showShimmer} screenWidth={screenWidth} />
          </View>
          <View
            style={styles.bubbleArea}
            onLayout={(e) => setBubbleAreaHeight(e.nativeEvent.layout.height)}
          >
            {bubbleAreaHeight > 0 && ONBOARDING_CATEGORIES.map((cat, i) => (
              <Bubble
                key={cat}
                label={cat}
                active={selectedCategories.includes(cat)}
                onPress={() => toggleCategory(cat)}
                layout={CATEGORY_LAYOUT[i]}
                index={i}
                animate={animateBubbles}
                colors={colors}
                areaHeight={bubbleAreaHeight}
                screenWidth={screenWidth}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label="Show me my feed"
            onPress={saveAndNavigate}
            variant="primary"
            disabled={categoryCount === 0}
            loading={saving}
          />
        </View>

        <View style={styles.logoSpacer} />
      </View>

      {/* Welcome bottom sheet — only on first signup, not profile reset */}
      <BottomSheet visible={showWelcome} onClose={() => setShowWelcome(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetHeading}>{"Let\u2019s personalise\nyour feed"}</Text>
          <Text style={styles.sheetSubtitle}>
            {"Dukanoh is built around what you love. Tell us what catches your eye and we\u2019ll curate a feed that feels like it was made for you."}
          </Text>
          <Button
            label="Get started"
            onPress={() => setShowWelcome(false)}
            variant="primary"
            style={styles.sheetButton}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    logoContainer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    content: {
      flex: 1,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.xl,
    },

    heading: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    subtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    hint: {
      ...Typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.xs,
    },

    // Hero card
    heroCard: {
      flex: 1,
      borderRadius: 24,
      backgroundColor: colors.primaryLight,
      marginTop: Spacing.base,
      marginBottom: Spacing.base,
    },
    shimmerClip: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 24,
      overflow: 'hidden',
    },
    bubbleArea: {
      flex: 1,
      margin: Spacing.base,
    },

    // Footer
    footer: {
      gap: Spacing.sm,
    },
    error: {
      ...Typography.caption,
      color: colors.error,
      textAlign: 'center',
    },
    logoSpacer: {
      height: LOGO_FINAL_H - 60,
    },

    // Welcome sheet
    sheetContent: {
      alignItems: 'center',
      paddingHorizontal: Spacing.xs,
    },
    sheetHeading: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    sheetSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    sheetButton: {
      marginTop: Spacing.xl,
      width: '100%',
    },
  });
}
