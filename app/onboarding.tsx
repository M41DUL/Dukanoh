import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import {
  Typography,
  Spacing,
  FontFamily,
  Categories,
  ColorTokens,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Button } from '@/components/Button';

const { width: SCREEN_W } = Dimensions.get('window');

const STEPS = ['welcome', 'categories', 'sizes'] as const;
type Step = (typeof STEPS)[number];

const ONBOARDING_CATEGORIES = Categories.filter((c) => c !== 'All');

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];

// ─── Bubble layout data ─────────────────────────────────────
// Each bubble has a position (% from left/top) and a size.
// Sizes vary to create the organic feel.

type BubbleLayout = { left: number; top: number; size: number };

// Category bubbles — 10 items, spaced to avoid overlap
// Max bubble size ~88px + 12% scale on select ≈ 100px.
// Container width ~360px, so 3 per row with offsets.
const CATEGORY_LAYOUT: BubbleLayout[] = [
  // Row 1
  { left: 0.02, top: 0.00, size: 84 },   // Men
  { left: 0.30, top: 0.02, size: 88 },   // Women
  { left: 0.60, top: 0.00, size: 82 },   // Casualwear
  // Row 2
  { left: 0.08, top: 0.18, size: 86 },   // Partywear
  { left: 0.40, top: 0.16, size: 90 },   // Festive
  { left: 0.72, top: 0.18, size: 80 },   // Formal
  // Row 3
  { left: 0.02, top: 0.36, size: 88 },   // Achkan
  { left: 0.34, top: 0.34, size: 84 },   // Wedding
  // Row 4
  { left: 0.12, top: 0.52, size: 86 },   // Pathani Suit
  { left: 0.48, top: 0.54, size: 82 },   // Shoes
];

// Size bubbles — letter sizes first, then number sizes
const SIZE_LAYOUT: BubbleLayout[] = [
  // Letter sizes — Row 1
  { left: 0.04, top: 0.00, size: 74 },   // XS
  { left: 0.30, top: 0.02, size: 78 },   // S
  { left: 0.58, top: 0.00, size: 74 },   // M
  // Letter sizes — Row 2
  { left: 0.10, top: 0.18, size: 76 },   // L
  { left: 0.38, top: 0.16, size: 74 },   // XL
  { left: 0.64, top: 0.18, size: 78 },   // XXL
  // Number sizes — Row 3
  { left: 0.04, top: 0.36, size: 74 },   // 6
  { left: 0.30, top: 0.34, size: 76 },   // 8
  { left: 0.58, top: 0.36, size: 74 },   // 10
  // Number sizes — Row 4
  { left: 0.10, top: 0.52, size: 76 },   // 12
  { left: 0.38, top: 0.54, size: 74 },   // 14
  { left: 0.64, top: 0.52, size: 76 },   // 16
];

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
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  layout: BubbleLayout;
  index: number;
  animate: boolean;
  colors: ColorTokens;
  areaHeight: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 400,
      delay: index * 60,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, []);

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

  const containerWidth = SCREEN_W - Spacing.base * 2;
  const bubbleSize = active ? layout.size * 1.12 : layout.size;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: layout.left * containerWidth,
        top: layout.top * areaHeight,
        opacity: entrance,
        transform: [{ scale: Animated.multiply(entrance, scale) }],
      }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          bubbleStyles.bubble,
          {
            width: bubbleSize,
            height: bubbleSize,
            borderRadius: bubbleSize / 2,
            backgroundColor: active ? colors.secondary : colors.surface,
            borderColor: active ? colors.secondary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            bubbleStyles.label,
            {
              color: active ? '#0D0D0D' : colors.textSecondary,
              fontSize: label.length > 8 ? 11 : 13,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  label: {
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});

// ─── Main screen ────────────────────────────────────────────

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [animateBubbles, setAnimateBubbles] = useState(false);
  const [bubbleAreaHeight, setBubbleAreaHeight] = useState(0);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const stepIndex = STEPS.indexOf(step);

  // Trigger bubble entrance animation when step changes
  useEffect(() => {
    if (step === 'categories' || step === 'sizes') {
      setAnimateBubbles(false);
      requestAnimationFrame(() => setAnimateBubbles(true));
    }
  }, [step]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }, []);

  const toggleSize = useCallback((size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size],
    );
  }, []);

  const saveAndNavigate = async () => {
    if (saving) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({
          preferred_categories: selectedCategories,
          preferred_sizes: selectedSizes,
          onboarding_completed: true,
        })
        .eq('id', user.id);
    }
    router.replace('/(tabs)/');
  };

  const handleNext = () => {
    if (step === 'welcome') setStep('categories');
    else if (step === 'categories') setStep('sizes');
    else saveAndNavigate();
  };

  const handleBack = () => {
    if (step === 'categories') setStep('welcome');
    else if (step === 'sizes') setStep('categories');
  };

  // Android hardware back button
  useEffect(() => {
    if (step === 'welcome') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => handler.remove();
  }, [step]);

  const categoryCount = selectedCategories.length;
  const sizeCount = selectedSizes.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Step dots */}
      <View style={styles.dotsRow}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < stepIndex && styles.dotDone,
              i === stepIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Back button */}
      {step !== 'welcome' && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      )}

      {/* ─── Welcome ─── */}
      {step === 'welcome' && (
        <View style={styles.welcomeContent}>
          <View style={styles.welcomeCenter}>
            <Text style={styles.welcomeEmoji}>✨</Text>
            <Text style={styles.heading}>Let's personalise{'\n'}your feed</Text>
            <Text style={styles.subtitle}>
              Pick the categories and sizes you're interested in. We'll show you more of what you love.
            </Text>
          </View>
          <View style={styles.footer}>
            <Button label="Get started" onPress={handleNext} variant="primary" />
          </View>
        </View>
      )}

      {/* ─── Categories ─── */}
      {step === 'categories' && (
        <View style={styles.stepContent}>
          <Text style={styles.heading}>What are you into?</Text>
          <Text style={styles.subtitle}>
            {categoryCount === 0 ? 'Pick at least one' : `${categoryCount} selected`}
          </Text>

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
              />
            ))}
          </View>

          <View style={styles.footer}>
            <Button
              label="Continue"
              onPress={handleNext}
              variant="primary"
              disabled={categoryCount === 0}
            />
          </View>
        </View>
      )}

      {/* ─── Sizes ─── */}
      {step === 'sizes' && (
        <View style={styles.stepContent}>
          <Text style={styles.heading}>What sizes do you wear?</Text>
          <Text style={styles.subtitle}>
            {sizeCount === 0 ? 'Select all that apply' : `${sizeCount} selected`}
          </Text>

          <View
            style={styles.bubbleArea}
            onLayout={(e) => setBubbleAreaHeight(e.nativeEvent.layout.height)}
          >
            {bubbleAreaHeight > 0 && ALL_SIZES.map((size, i) => (
              <Bubble
                key={size}
                label={size}
                active={selectedSizes.includes(size)}
                onPress={() => toggleSize(size)}
                layout={SIZE_LAYOUT[i]}
                index={i}
                animate={animateBubbles}
                colors={colors}
                areaHeight={bubbleAreaHeight}
              />
            ))}
          </View>

          <View style={styles.footer}>
            <Button
              label="Finish"
              onPress={saveAndNavigate}
              variant="primary"
              loading={saving}
            />
            <TouchableOpacity onPress={saveAndNavigate} disabled={saving}>
              <Text style={styles.skipText}>Skip this step</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: Spacing.base,
    },

    // Dots
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.xs,
      marginTop: Spacing.base,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotDone: {
      backgroundColor: colors.primary,
      opacity: 0.35,
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 22,
    },

    // Back
    backBtn: {
      alignSelf: 'flex-start',
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
    },

    // Welcome
    welcomeContent: {
      flex: 1,
      justifyContent: 'space-between',
    },
    welcomeCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
    },
    welcomeEmoji: {
      fontSize: 48,
      marginBottom: Spacing.xl,
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

    // Step content
    stepContent: {
      flex: 1,
      paddingTop: Spacing.xl,
    },

    // Bubble area
    bubbleArea: {
      flex: 1,
      marginTop: Spacing.xl,
    },

    // Footer
    footer: {
      paddingBottom: Spacing['2xl'],
      gap: Spacing.base,
    },
    skipText: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });
}
