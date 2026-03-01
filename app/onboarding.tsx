import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Typography, Spacing, BorderRadius, Categories } from '@/constants/theme';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.32;
const CARD_WIDTH = width - Spacing.base * 2;
const CARD_HEIGHT = height * 0.56;
const FALLBACK_CATEGORIES = (Categories as readonly string[]).filter(c => c !== 'All');

interface OnboardingListing {
  id: string;
  title: string;
  price: number;
  category: string;
  images: string[];
}

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const [listings, setListings] = useState<OnboardingListing[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // Refs avoid stale closure issues in gesture callbacks
  const indexRef = useRef(0);
  const likedRef = useRef<string[]>([]);
  const listingsRef = useRef<OnboardingListing[]>([]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, title, price, category, images')
        .eq('status', 'available')
        .neq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (data && data.length >= 6) {
        const ls = data as OnboardingListing[];
        setListings(ls);
        listingsRef.current = ls;
      } else {
        setUseFallback(true);
      }
      setLoading(false);
    })();
  }, [user]);

  const saveAndNavigate = async (categories: string[]) => {
    if (!user || saving) return;
    setSaving(true);
    const unique = [...new Set(categories)];
    await supabase
      .from('users')
      .update({ preferred_categories: unique, onboarding_completed: true })
      .eq('id', user.id);
    await refreshProfile();
    router.replace('/(tabs)/');
  };

  const handleSwipe = (direction: 'like' | 'skip') => {
    const current = listingsRef.current[indexRef.current];
    if (direction === 'like' && current) {
      likedRef.current = [...likedRef.current, current.category];
    }

    const nextIndex = indexRef.current + 1;
    if (nextIndex >= listingsRef.current.length) {
      saveAndNavigate(likedRef.current);
    } else {
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      translateX.value = 0;
      translateY.value = 0;
    }
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.12;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const direction = e.translationX > 0 ? 'like' : 'skip';
        translateX.value = withTiming(
          direction === 'like' ? width * 1.5 : -width * 1.5,
          { duration: 220 },
          () => runOnJS(handleSwipe)(direction)
        );
      } else {
        translateX.value = withSpring(0, { damping: 15 });
        translateY.value = withSpring(0, { damping: 15 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-width, width],
          [-25, 25],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const likeOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const skipOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const swipeOut = (direction: 'like' | 'skip') => {
    translateX.value = withTiming(
      direction === 'like' ? width * 1.5 : -width * 1.5,
      { duration: 220 },
      () => runOnJS(handleSwipe)(direction)
    );
  };

  if (loading) return <LoadingSpinner />;

  // Fallback: category chips when fewer than 6 listings exist
  if (useFallback) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>What do you love?</Text>
        <Text style={styles.subtitle}>Pick the categories you're interested in.</Text>
        <View style={styles.catGrid}>
          {FALLBACK_CATEGORIES.map(cat => (
            <Badge
              key={cat}
              label={cat}
              active={selectedCats.includes(cat)}
              onPress={() =>
                setSelectedCats(prev =>
                  prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                )
              }
            />
          ))}
        </View>
        <Button
          label="Start exploring"
          onPress={() => saveAndNavigate(selectedCats)}
          loading={saving}
          style={styles.fallbackBtn}
        />
        <TouchableOpacity onPress={() => saveAndNavigate([])}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const current = listings[index];
  const next = listings[index + 1];
  if (!current) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>What do you love?</Text>
        <Text style={styles.subtitle}>Swipe right on items you like</Text>
        <View style={styles.progressDots}>
          {listings.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < index && styles.dotDone,
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.cardStack}>
        {/* Next card peeking behind */}
        {next && (
          <View style={[styles.card, styles.nextCard]}>
            <Image
              source={{ uri: next.images?.[0] }}
              style={styles.cardImage}
              resizeMode="cover"
            />
            <View style={styles.cardInfo}>
              <Badge label={next.category} active />
              <Text style={styles.cardTitle} numberOfLines={1}>{next.title}</Text>
              <Text style={styles.cardPrice}>£{next.price.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Current swipeable card */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, cardStyle]}>
            <Image
              source={{ uri: current.images?.[0] }}
              style={styles.cardImage}
              resizeMode="cover"
            />

            <Animated.View style={[styles.indicator, styles.likeIndicator, likeOpacity]}>
              <Ionicons name="heart" size={24} color={Colors.secondary} />
              <Text style={[styles.indicatorLabel, { color: Colors.secondary }]}>LIKE</Text>
            </Animated.View>

            <Animated.View style={[styles.indicator, styles.skipIndicator, skipOpacity]}>
              <Ionicons name="close" size={24} color={Colors.error} />
              <Text style={[styles.indicatorLabel, { color: Colors.error }]}>SKIP</Text>
            </Animated.View>

            <View style={styles.cardInfo}>
              <Badge label={current.category} active />
              <Text style={styles.cardTitle} numberOfLines={1}>{current.title}</Text>
              <Text style={styles.cardPrice}>£{current.price.toFixed(2)}</Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.skipBtn]}
          onPress={() => swipeOut('skip')}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={28} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.likeBtn]}
          onPress={() => swipeOut('like')}
          activeOpacity={0.8}
        >
          <Ionicons name="heart" size={28} color={Colors.background} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => saveAndNavigate([])} disabled={saving}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  title: {
    ...Typography.heading,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotDone: {
    backgroundColor: Colors.primary,
    opacity: 0.35,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 22,
  },
  cardStack: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  nextCard: {
    transform: [{ scale: 0.95 }],
  },
  cardImage: {
    width: '100%',
    height: '72%',
  },
  cardInfo: {
    flex: 1,
    padding: Spacing.base,
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  cardTitle: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  cardPrice: {
    ...Typography.subheading,
    color: Colors.primary,
  },
  indicator: {
    position: 'absolute',
    top: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2.5,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  likeIndicator: {
    right: Spacing.base,
    borderColor: Colors.secondary,
  },
  skipIndicator: {
    left: Spacing.base,
    borderColor: Colors.error,
  },
  indicatorLabel: {
    ...Typography.label,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing['3xl'],
    marginTop: Spacing.xl,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  skipBtn: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  likeBtn: {
    backgroundColor: Colors.primary,
  },
  skipText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xl,
    textDecorationLine: 'underline',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  fallbackBtn: {
    marginTop: Spacing.xl,
    width: CARD_WIDTH,
  },
});
