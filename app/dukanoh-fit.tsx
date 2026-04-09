import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import { proRankSort } from '@/utils/proRankSort';
import {
  getComplementaryCategories,
  getCompatibleColours,
  scoreMatch,
  type MatchInput,
} from '@/utils/styleMatch';

// ─── Constants ───────────────────────────────────────────────────────────────

const RECENT_LOOKS_KEY = '@dukanoh/recent_looks';
const MAX_RECENT = 3;
const RATE_LIMIT_KEY = '@dukanoh/fit_searches_today';
const MAX_SEARCHES_PER_DAY = 10;

const CATEGORIES = [
  'Lehenga', 'Saree', 'Anarkali', 'Sherwani', 'Kurta',
  'Achkan', 'Pathani Suit', 'Dupatta', 'Blouse', 'Sharara',
  'Salwar', 'Nehru Jacket',
] as const;

const COLOURS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gold', 'Pink', 'Maroon', 'Beige', 'Multi', 'Other'] as const;
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'] as const;
const FABRIC_WEIGHTS = ['Light', 'Structured', 'Heavy'] as const;

type FabricWeight = typeof FABRIC_WEIGHTS[number];
type Step = 'form' | 'results';

interface RecentLook {
  category: string;
  colour: string;
  occasion?: string;
  fabricWeight?: FabricWeight;
  timestamp: number;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DukanohFitScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user } = useAuth();
  const { blockedIds } = useBlocked();

  // Params passed from DukanohFitSheet after validation
  const {
    photoUri: paramPhotoUri,
    detectedCategory,
    detectedColour,
  } = useLocalSearchParams<{
    photoUri?: string;
    detectedCategory?: string;
    detectedColour?: string;
  }>();

  // Step
  const [step, setStep] = useState<Step>('form');

  // Form — pre-fill from Rekognition params if present
  const [category, setCategory] = useState(detectedCategory ?? '');
  const [colour, setColour] = useState(detectedColour ?? '');
  const [occasion, setOccasion] = useState('');
  const [fabricWeight, setFabricWeight] = useState('');

  // Track which fields were auto-detected
  const [detectedFields] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (detectedCategory) s.add('category');
    if (detectedColour) s.add('colour');
    return s;
  });

  // State
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Listing[]>([]);
  const [recentLooks, setRecentLooks] = useState<RecentLook[]>([]);

  // Load recent looks on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_LOOKS_KEY)
      .then(raw => { if (raw) setRecentLooks(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  // ─── Rate limit ────────────────────────────────────────────────────────────
  const checkRateLimit = useCallback(async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const today = new Date().toDateString();
      const data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) return true;
      return data.count < MAX_SEARCHES_PER_DAY;
    } catch { return true; }
  }, []);

  const incrementRateLimit = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const today = new Date().toDateString();
      const data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      const newData = data.date === today
        ? { date: today, count: data.count + 1 }
        : { date: today, count: 1 };
      await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newData));
    } catch {}
  }, []);

  // ─── Save recent look ──────────────────────────────────────────────────────
  const saveRecentLook = useCallback(async (look: Omit<RecentLook, 'timestamp'>) => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_LOOKS_KEY);
      const existing: RecentLook[] = raw ? JSON.parse(raw) : [];
      const updated = [
        { ...look, timestamp: Date.now() },
        ...existing.filter(l => l.category !== look.category || l.colour !== look.colour || l.occasion !== look.occasion),
      ].slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_LOOKS_KEY, JSON.stringify(updated));
      setRecentLooks(updated);
    } catch {}
  }, []);

  // ─── Run match ─────────────────────────────────────────────────────────────
  const runMatch = useCallback(async (input: MatchInput) => {
    if (!user) return;

    const allowed = await checkRateLimit();
    if (!allowed) {
      Alert.alert('Daily limit reached', 'You\'ve used all 10 Dukanoh Fit searches for today. Come back tomorrow.');
      return;
    }

    setLoading(true);
    setStep('results');

    const complementary = getComplementaryCategories(input.category);
    if (complementary.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const compat = getCompatibleColours(input.colour);
    const allCompatibleColours = [...compat.primary, ...compat.secondary];

    let q = supabase
      .from('listings')
      .select('*, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)')
      .eq('status', 'available')
      .in('category', complementary)
      .neq('seller_id', user.id);

    if (blockedIds.length > 0) q = q.not('seller_id', 'in', `(${blockedIds.join(',')})`);

    // Colour is a hard filter — never show clashing combinations.
    // Neutrals (Beige, White, Other) match everything so no filter applied.
    if (allCompatibleColours.length > 0 && !['Beige', 'White', 'Other'].includes(input.colour)) {
      q = q.in('colour', allCompatibleColours);
    }

    const { data } = await q.order('save_count', { ascending: false }).limit(100);

    const listings = (data ?? []) as unknown as Listing[];

    // Score each listing
    const scored = listings
      .map(l => ({
        listing: l,
        score: scoreMatch(input, {
          category: (l as any).category,
          colour: (l as any).colour,
          occasion: (l as any).occasion,
          fabricWeight: (l as any).fabric_weight,
          save_count: (l as any).save_count,
        }),
        save_count: (l as any).save_count ?? 0,
      }))
      .sort((a, b) => b.score - a.score || b.save_count - a.save_count)
      .map(s => s.listing);

    // Seller diversity cap: max 2 per seller
    const sellerCount = new Map<string, number>();
    const diverse = scored.filter(l => {
      const sid = (l as any).seller_id as string;
      const count = sellerCount.get(sid) ?? 0;
      if (count >= 2) return false;
      sellerCount.set(sid, count + 1);
      return true;
    });

    setResults(proRankSort(diverse));
    await incrementRateLimit();
    await saveRecentLook({
      category: input.category,
      colour: input.colour,
      occasion: input.occasion,
      fabricWeight: input.fabricWeight as FabricWeight,
    });
    setLoading(false);
  }, [user, blockedIds, checkRateLimit, incrementRateLimit, saveRecentLook]);

  // ─── Submit form ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!category || !colour) {
      Alert.alert('Almost there', 'Please select a category and colour to continue.');
      return;
    }
    await runMatch({
      category,
      colour,
      occasion: occasion || undefined,
      fabricWeight: (fabricWeight as FabricWeight) || undefined,
    });
  }, [category, colour, occasion, fabricWeight, runMatch]);

  // ─── Render results ────────────────────────────────────────────────────────
  if (step === 'results') {
    return (
      <ScreenWrapper>
        <Header title="Dukanoh Fit" showBack />
        {loading ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                heading="No matches found"
                subtext="Try a different colour or occasion — we'll find the right pieces."
                ctaLabel="Try again"
                onCta={() => { setStep('form'); setResults([]); }}
              />
            }
          />
        )}
      </ScreenWrapper>
    );
  }

  // ─── Render form ───────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <Header title="Dukanoh Fit" showBack />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Photo preview */}
        {paramPhotoUri ? (
          <Image source={{ uri: paramPhotoUri }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Recent looks */}
        {recentLooks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Recent looks</Text>
            {recentLooks.map((look, i) => (
              <TouchableOpacity
                key={i}
                style={styles.recentRow}
                activeOpacity={0.7}
                onPress={() => {
                  setCategory(look.category);
                  setColour(look.colour);
                  setOccasion(look.occasion ?? '');
                  setFabricWeight(look.fabricWeight ?? '');
                  if (paramPhotoUri) runMatch({
                    category: look.category,
                    colour: look.colour,
                    occasion: look.occasion,
                    fabricWeight: look.fabricWeight,
                  });
                }}
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.recentText}>
                  {look.colour} {look.category}{look.occasion ? ` · ${look.occasion}` : ''}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Category */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
            {detectedFields.has('category') && <Text style={styles.detectedTag}>Detected</Text>}
          </View>
          <Select
            placeholder="Select category"
            value={category}
            options={CATEGORIES}
            onSelect={v => setCategory(v)}
          />
        </View>

        {/* Colour */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>Colour <Text style={styles.required}>*</Text></Text>
            {detectedFields.has('colour') && <Text style={styles.detectedTag}>Detected</Text>}
          </View>
          <Select
            placeholder="Select colour"
            value={colour}
            options={COLOURS}
            onSelect={v => setColour(v)}
          />
        </View>

        {/* Occasion */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Occasion <Text style={styles.optional}>(optional)</Text></Text>
          <Select
            placeholder="Select occasion"
            value={occasion}
            options={OCCASIONS}
            onSelect={v => setOccasion(v)}
          />
        </View>

        {/* Fabric weight */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fabric weight <Text style={styles.optional}>(optional)</Text></Text>
          <Text style={styles.sectionHint}>Light · Chiffon, Georgette  ·  Structured · Silk, Cotton  ·  Heavy · Velvet, Brocade</Text>
          <Select
            placeholder="Select fabric weight"
            value={fabricWeight}
            options={FABRIC_WEIGHTS}
            onSelect={v => setFabricWeight(v)}
          />
        </View>

        <Button
          label="Find my fit"
          variant="primary"
          onPress={handleSubmit}
          disabled={!category || !colour}
          style={styles.cta}
        />

      </ScrollView>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: { paddingBottom: Spacing['4xl'] },
    photo: {
      width: '100%',
      height: 220,
      borderRadius: BorderRadius.large,
      marginBottom: Spacing.lg,
    },
    section: { marginBottom: Spacing.lg },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    sectionLabel: {
      ...Typography.label,
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    detectedTag: {
      ...Typography.micro,
      color: colors.primary,
      fontFamily: FontFamily.semibold,
      backgroundColor: `${colors.primary}18`,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    sectionHint: {
      ...Typography.small,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    required: { color: colors.error },
    optional: { color: colors.textSecondary, fontFamily: FontFamily.regular },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    recentText: { ...Typography.body, color: colors.textPrimary, flex: 1 },
    cta: { marginTop: Spacing.base },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
    gridContent: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['4xl'] },
  });
}
