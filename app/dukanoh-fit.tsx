import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
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
];

const COLOURS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Gold', 'Pink', 'Maroon', 'Beige', 'Multi', 'Other'];
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'];
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

// ─── Pill selector ───────────────────────────────────────────────────────────

function PillSelector({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
  colors: ColorTokens;
}) {
  const styles = useMemo(() => getPillStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[styles.pill, selected === opt && styles.pillActive]}
          onPress={() => onSelect(opt)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, selected === opt && styles.pillTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function getPillStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    pill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: { ...Typography.small, color: colors.textSecondary, fontFamily: FontFamily.medium },
    pillTextActive: { color: '#fff' },
  });
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DukanohFitScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user } = useAuth();
  const { blockedIds } = useBlocked();

  // Step
  const [step, setStep] = useState<Step>('form');

  // Photo
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Form
  const [category, setCategory] = useState('');
  const [colour, setColour] = useState('');
  const [occasion, setOccasion] = useState('');
  const [fabricWeight, setFabricWeight] = useState<FabricWeight | ''>('');
  const [detectedFields, setDetectedFields] = useState<Set<string>>(new Set());

  // State
  const [validating, setValidating] = useState(false);
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
      if (data.date !== today) return true; // new day — reset
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

  // ─── Camera ────────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Please allow camera access in your settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    setValidating(true);
    const isClothing = await validateClothing(uri);
    setValidating(false);

    if (!isClothing) {
      setPhotoUri(null);
      setDetectedFields(new Set());
      Alert.alert(
        'Not a clothing item',
        'Please take a photo of the clothing piece you want to match.',
        [{ text: 'Try again', onPress: openCamera }]
      );
    }
  }, [validateClothing]);

  // ─── Validate clothing with Rekognition + pre-fill form ───────────────────
  const validateClothing = useCallback(async (uri: string): Promise<boolean> => {
    try {
      // Compress to max 1MB before sending
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!compressed.base64) return false;

      const { data, error } = await supabase.functions.invoke('validate-clothing', {
        body: { imageBase64: compressed.base64 },
      });

      if (error || !data || !data.isClothing) return false;

      // Pre-fill form with detected values — user can still override
      const detected = new Set<string>();
      if (data.detectedCategory) { setCategory(data.detectedCategory); detected.add('category'); }
      if (data.detectedColour) { setColour(data.detectedColour); detected.add('colour'); }
      setDetectedFields(detected);

      return true;
    } catch { return false; }
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
    // Occasion is a scoring signal only — occasion-matched pieces rank first
    // but non-matched pieces are still shown (more results, still valid outfits).
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
    await saveRecentLook({ category: input.category, colour: input.colour, occasion: input.occasion, fabricWeight: input.fabricWeight as FabricWeight });
    setLoading(false);
  }, [user, blockedIds, checkRateLimit, incrementRateLimit, saveRecentLook]);

  // ─── Submit form ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!photoUri) {
      Alert.alert('No photo', 'Please take a photo of your piece first.');
      return;
    }
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
  }, [category, colour, occasion, fabricWeight, photoUri, runMatch]);

  // ─── Render results ────────────────────────────────────────────────────────
  if (step === 'results') {
    return (
      <ScreenWrapper>
        <Header
          title="Dukanoh Fit"
          showBack
          onBack={() => { setStep('form'); setResults([]); }}
        />
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

        {/* Photo */}
        <TouchableOpacity style={[styles.photoBox, photoUri && styles.photoBoxFilled]} onPress={openCamera} activeOpacity={0.8} disabled={validating}>
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              {validating && (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.photoOverlayText}>Checking image...</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
              <Text style={styles.photoHint}>Take a photo of your piece</Text>
            </View>
          )}
        </TouchableOpacity>

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
                  if (photoUri) runMatch({
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
          <PillSelector options={CATEGORIES} selected={category} onSelect={v => { setCategory(v); setDetectedFields(p => { const n = new Set(p); n.delete('category'); return n; }); }} colors={colors} />
        </View>

        {/* Colour */}
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>Colour <Text style={styles.required}>*</Text></Text>
            {detectedFields.has('colour') && <Text style={styles.detectedTag}>Detected</Text>}
          </View>
          <PillSelector options={COLOURS} selected={colour} onSelect={v => { setColour(v); setDetectedFields(p => { const n = new Set(p); n.delete('colour'); return n; }); }} colors={colors} />
        </View>

        {/* Occasion */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Occasion <Text style={styles.optional}>(optional)</Text></Text>
          <PillSelector options={OCCASIONS} selected={occasion} onSelect={v => setOccasion(prev => prev === v ? '' : v)} colors={colors} />
        </View>

        {/* Fabric weight */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fabric weight <Text style={styles.optional}>(optional)</Text></Text>
          <Text style={styles.sectionHint}>Light · Chiffon, Georgette — Structured · Silk, Cotton — Heavy · Velvet, Brocade</Text>
          <PillSelector options={FABRIC_WEIGHTS} selected={fabricWeight} onSelect={v => setFabricWeight(prev => prev === v ? '' : v as FabricWeight)} colors={colors} />
        </View>

        <Button
          label="Find my fit"
          variant="primary"
          onPress={handleSubmit}
          disabled={validating || !category || !colour || !photoUri}
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
    photoBox: {
      height: 200,
      borderRadius: BorderRadius.large,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      marginBottom: Spacing.lg,
      overflow: 'hidden',
    },
    photoBoxFilled: { borderStyle: 'solid', borderColor: 'transparent' },
    photo: { width: '100%', height: '100%' },
    photoOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
    },
    photoOverlayText: { ...Typography.body, color: '#fff', fontFamily: FontFamily.semibold },
    photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
    photoHint: { ...Typography.body, color: colors.textSecondary },
    section: { marginBottom: Spacing.lg },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    sectionLabel: { ...Typography.label, color: colors.textPrimary, fontFamily: FontFamily.semibold },
    detectedTag: {
      ...Typography.micro,
      color: colors.primary,
      fontFamily: FontFamily.semibold,
      backgroundColor: `${colors.primary}18`,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    sectionHint: { ...Typography.small, color: colors.textSecondary, marginBottom: Spacing.sm },
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
    spinner: { marginTop: Spacing.sm },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
    gridContent: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['4xl'] },
  });
}
