import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  BackHandler,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { BottomBar } from '@/components/BottomBar';
import { Select } from '@/components/Select';
import { ListingCard, Listing } from '@/components/ListingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { BorderRadius, Categories, ColorTokens, Colours, FontFamily, Genders, Occasions, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { useBlocked } from '@/context/BlockedContext';
import { supabase } from '@/lib/supabase';
import { proRankSort } from '@/utils/proRankSort';
import {
  fabricToWeight,
  getMissingPieces,
  getStrictColours,
  getSuggestionPlan,
  inferGenderForCategory,
  isColourCompatible,
  isNeutralBaseColour,
  MIN_STRICT_RESULTS,
  parseFitAttributes,
  scoreMatch,
  type FabricWeight,
  type MatchInput,
  type Piece,
} from '@/utils/styleMatch';
import { buildFitSummary, missingSearchNote } from '@/utils/fitSummary';

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Derive from theme — exclude meta/non-garment entries
const CATEGORIES = Categories.filter(c => !['All', 'Casualwear', 'Shoes'].includes(c));
const FABRIC_WEIGHTS = ['Light', 'Structured', 'Heavy'] as const;

// gender + fabric feed the filter and scoring; tax_hold mirrors the feed —
// a tax-held seller's pieces can't be bought, so they aren't suggested.
const LISTING_SELECT =
  'id, title, price, original_price, price_dropped_at, images, status, category, gender, condition, size, occasion, colour, fabric, save_count, created_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified, tax_hold)';

type Step = 'form' | 'results';
/** The confirmation card when the engine read the piece; the full form otherwise, or on "Change something". */
type ConfirmMode = 'card' | 'form';

interface SearchInput extends MatchInput {
  gender: string;
  pieces: Piece[];
}

interface ResultsState {
  listings: Listing[];
  widened: boolean;
  failed: boolean;
  /** "Looking for a dupatta first." when the search led with a missing piece. */
  note: string | null;
}

const EMPTY_RESULTS: ResultsState = { listings: [], widened: false, failed: false, note: null };

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DukanohFitScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { user } = useAuth();
  const { blockedIds } = useBlocked();

  const {
    photoUri: paramPhotoUri,
    detectedCategory,
    detectedColour,
    detectedEngine,
    detectedEngineVersion,
    detectedConfidence,
    detectedGender,
    detectedModel,
    detectedAttributes,
    hasPerson,
  } = useLocalSearchParams<{
    photoUri?: string;
    detectedCategory?: string;
    detectedColour?: string;
    detectedEngine?: string;
    detectedEngineVersion?: string;
    detectedConfidence?: string;
    detectedGender?: string;
    detectedModel?: string;
    detectedAttributes?: string;
    hasPerson?: string;
  }>();

  // The engine's richer read: accent colours, embellishment, pieces in shot.
  const attrs = useMemo(() => parseFitAttributes(detectedAttributes), [detectedAttributes]);

  const [step, setStep] = useState<Step>('form');

  const [category, setCategory] = useState(detectedCategory ?? '');
  // The category settles gender where it can; otherwise the engine's guess
  // pre-fills the picker and the member can change it.
  const [gender, setGender] = useState<string>(() => {
    const fromCategory = detectedCategory ? inferGenderForCategory(detectedCategory) : null;
    if (fromCategory) return fromCategory;
    return detectedGender === 'Men' || detectedGender === 'Women' ? detectedGender : '';
  });
  const [colour, setColour] = useState(detectedColour ?? '');
  const [occasion, setOccasion] = useState('');
  const [fabricWeight, setFabricWeight] = useState('');

  const [detectedFields] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (detectedCategory) s.add('category');
    if (detectedColour) s.add('colour');
    return s;
  });

  // Single-gender categories (Lehenga, Sherwani…) settle who wears the piece.
  // Kurta and Salwar are listed under both, so the member picks.
  const inferredGender = category ? inferGenderForCategory(category) : null;
  const effectiveGender = inferredGender ?? gender;
  const canSubmit = !!category && !!colour && !!effectiveGender;

  // One tap when the engine read enough to say what the piece is.
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(() =>
    detectedCategory && detectedColour && (inferGenderForCategory(detectedCategory) || detectedGender === 'Men' || detectedGender === 'Women')
      ? 'card'
      : 'form'
  );

  const missing = useMemo(() => getMissingPieces(category, effectiveGender, attrs.pieces), [category, effectiveGender, attrs.pieces]);
  const summary = useMemo(() => buildFitSummary({
    category, colour, gender: effectiveGender,
    accentColours: attrs.accentColours, embellishment: attrs.embellishment, missing,
  }), [category, colour, effectiveGender, attrs, missing]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultsState>(EMPTY_RESULTS);

  // Ignore responses from a search the member has already moved on from.
  const searchSeq = useRef(0);
  // One training upload per photo — re-submitting the same shot must not
  // store it again.
  const uploadedPhotoRef = useRef<string | null>(null);

  const backToForm = useCallback(() => setStep('form'), []);

  // Android hardware back on results returns to the form rather than leaving.
  useEffect(() => {
    if (step !== 'results') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('form');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  // ─── Run match ─────────────────────────────────────────────────────────────
  // Resolves true when a search was allowed and ran (even if it returned
  // nothing), false when it never started.
  const runMatch = useCallback(async (input: SearchInput): Promise<boolean> => {
    if (!user) return false;

    // Server-side rate limit — atomic check + insert via DB RPC. A transport
    // or permission error is not the daily limit, so say so.
    const { data: allowed, error: rpcError } = await supabase.rpc('record_fit_search');
    if (rpcError) {
      Alert.alert("Can't connect right now", 'Check your connection and try again.');
      return false;
    }
    if (!allowed) {
      Alert.alert('Daily limit reached', "You've used all 10 Dukanoh Fit searches for today. Come back tomorrow.");
      return false;
    }

    const seq = ++searchSeq.current;
    setLoading(true);
    setStep('results');
    setResults(EMPTY_RESULTS);

    // What to look for: the pieces the photo is missing first, outfit extras
    // after; or the fixed table when the engine didn't read the photo.
    const plan = getSuggestionPlan({ category: input.category, gender: input.gender, pieces: input.pieces });
    if (plan.categories.length === 0) {
      setLoading(false);
      return true;
    }
    const note = missingSearchNote(plan.missing);

    // Validate blockedIds are UUIDs before using in query
    const safeBlockedIds = blockedIds.filter(id => UUID_REGEX.test(id));

    const buildBase = () => {
      let q = supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('status', 'available')
        .in('category', plan.categories)
        .eq('gender', input.gender)
        .neq('seller_id', user.id);
      if (safeBlockedIds.length > 0) q = q.not('seller_id', 'in', `(${safeBlockedIds.join(',')})`);
      return q.order('save_count', { ascending: false });
    };

    // Strict pass: colour-compatible pieces, including the base piece's own
    // accent colours (gold dupattas for a maroon-and-gold anarkali). A neutral
    // base colour pairs with everything, so no filter applies.
    const accents = input.accentColours ?? [];
    const strictColours = getStrictColours(input.colour, accents);
    const useColourFilter = !isNeutralBaseColour(input.colour) && strictColours.length > 0;

    const strictQuery = useColourFilter ? buildBase().in('colour', strictColours) : buildBase();
    const strictRes = await strictQuery.limit(100);
    if (seq !== searchSeq.current) return true;
    if (strictRes.error) {
      setResults({ ...EMPTY_RESULTS, failed: true });
      setLoading(false);
      return true;
    }

    let candidates = strictRes.data ?? [];
    let widened = false;

    // Widen pass: with a thin catalogue the colour filter empties the grid.
    // Pull in pieces whose colour is unknown or outside the compatible set;
    // they rank below every strict match.
    if (useColourFilter && candidates.length < MIN_STRICT_RESULTS) {
      const widenRes = await buildBase()
        .or(`colour.is.null,colour.not.in.(${strictColours.join(',')})`)
        .limit(50);
      if (seq !== searchSeq.current) return true;
      if (!widenRes.error && widenRes.data && widenRes.data.length > 0) {
        candidates = [...candidates, ...widenRes.data];
        widened = true;
      }
    }

    const scoringInput: MatchInput = { ...input, priorityCategories: plan.priority };
    const scored = candidates
      .filter(l => !l.seller?.tax_hold)
      .map(l => ({
        listing: l,
        compatible: isColourCompatible(input.colour, l.colour, accents),
        score: scoreMatch(scoringInput, {
          category: l.category ?? '',
          colour: l.colour,
          occasion: l.occasion,
          fabricWeight: fabricToWeight(l.fabric),
          save_count: l.save_count,
        }),
        save_count: l.save_count ?? 0,
      }))
      .sort((a, b) =>
        Number(b.compatible) - Number(a.compatible) ||
        b.score - a.score ||
        b.save_count - a.save_count
      )
      .map(s => s.listing);

    const sellerCount = new Map<string, number>();
    const diverse = scored.filter(l => {
      const sid = l.seller_id;
      const count = sellerCount.get(sid) ?? 0;
      if (count >= 2) return false;
      sellerCount.set(sid, count + 1);
      return true;
    });

    setResults({ listings: proRankSort(diverse), widened, failed: false, note });
    setLoading(false);
    return true;
  }, [user, blockedIds]);

  // ─── Training image (silent, background) ──────────────────────────────────
  // Sends the photo with the labels the member confirmed and the engine's
  // original guess, so the dataset learns from corrections. The server keeps
  // no link to the member. A photo with a person in it is never sent.
  const storeTrainingImage = useCallback((photoUri: string, confirmed: SearchInput) => {
    if (hasPerson === '1') return;
    ImageManipulator.manipulateAsync(
      photoUri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    ).then(compressed => {
      if (!compressed.base64) return;
      const raw = compressed.base64;
      const imageBase64 = raw.includes(',') ? raw.split(',')[1] : raw;
      const parsedConfidence = detectedConfidence ? Number(detectedConfidence) : NaN;
      return supabase.functions.invoke('store-training-image', {
        body: {
          imageBase64,
          category: confirmed.category,
          gender: confirmed.gender,
          colour: confirmed.colour,
          occasion: confirmed.occasion ?? null,
          fabricWeight: confirmed.fabricWeight ?? null,
          hasPerson: false,
          predicted: {
            category: detectedCategory || null,
            colour: detectedColour || null,
            confidence: Number.isFinite(parsedConfidence) ? parsedConfidence : null,
            engine: detectedEngine || null,
            engineVersion: detectedEngineVersion || null,
            model: detectedModel || null,
          },
          attributes: attrs,
        },
      });
    }).catch(() => {});
  }, [hasPerson, detectedCategory, detectedColour, detectedConfidence, detectedEngine, detectedEngineVersion, detectedModel, attrs]);

  // ─── Result tap (success metric) ───────────────────────────────────────────
  const logResultTap = useCallback((listingId: string) => {
    if (!user) return;
    // Fire-and-forget analytics — never blocks navigation, never surfaces.
    supabase
      .from('fit_result_taps')
      .insert({ user_id: user.id, listing_id: listingId })
      .then(() => {}, () => {});
  }, [user]);

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!category || !colour || !effectiveGender) {
      Alert.alert('Almost there', 'Please select a category and colour to continue.');
      return;
    }
    const input: SearchInput = {
      category,
      colour,
      gender: effectiveGender,
      accentColours: attrs.accentColours,
      pieces: attrs.pieces,
      occasion: occasion || undefined,
      fabricWeight: (fabricWeight as FabricWeight) || undefined,
    };
    const ran = await runMatch(input);
    // Training upload only after a search actually ran, and once per photo.
    if (ran && paramPhotoUri && uploadedPhotoRef.current !== paramPhotoUri) {
      uploadedPhotoRef.current = paramPhotoUri;
      storeTrainingImage(paramPhotoUri, input);
    }
  }, [category, colour, effectiveGender, attrs, occasion, fabricWeight, runMatch, paramPhotoUri, storeTrainingImage]);

  // ─── Results ───────────────────────────────────────────────────────────────
  if (step === 'results') {
    const headerLines = [results.note, results.widened ? "Not many exact colour matches yet, so we've widened the search." : null]
      .filter((l): l is string => !!l);
    return (
      <ScreenWrapper>
        <Header title="Dukanoh Fit" showBack onBack={backToForm} />
        {loading ? (
          <LoadingSpinner />
        ) : results.failed ? (
          <EmptyState
            heading="Something went wrong"
            subtext="That didn't go through — give it another try."
            ctaLabel="Try again"
            onCta={backToForm}
          />
        ) : (
          <FlatList
            data={results.listings}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              headerLines.length > 0 ? (
                <View style={styles.resultsNotes}>
                  {headerLines.map(line => <Text key={line} style={styles.widenedNote}>{line}</Text>)}
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <ListingCard
                listing={item}
                variant="grid"
                onPress={() => {
                  logResultTap(item.id);
                  router.push(`/listing/${item.id}`);
                }}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                heading="No matches found"
                subtext="Try a different colour or occasion and we'll find the right pieces."
                ctaLabel="Try again"
                onCta={backToForm}
              />
            }
          />
        )}
      </ScreenWrapper>
    );
  }

  // ─── Form ──────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <Header title="Dukanoh Fit" showBack />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {paramPhotoUri ? (
          <Image source={{ uri: paramPhotoUri }} style={styles.photo} contentFit="cover" />
        ) : null}

        {confirmMode === 'card' ? (
          // ── One-tap confirmation ──────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>What we see</Text>
            <Text style={styles.cardHeadline}>{summary.headline}</Text>
            {summary.detail ? <Text style={styles.cardDetail}>{summary.detail}</Text> : null}
            {summary.missingLine ? <Text style={styles.cardMissing}>{summary.missingLine}</Text> : null}
            <TouchableOpacity onPress={() => setConfirmMode('form')} activeOpacity={0.7} hitSlop={8} style={styles.changeLink}>
              <Text style={styles.changeLinkText}>Change something</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Category */}
            <View style={styles.section}>
              {detectedFields.has('category') && (
                <View style={styles.labelRow}>
                  <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
                  <Text style={styles.detectedTag}>Does this look right?</Text>
                </View>
              )}
              <Select
                label={detectedFields.has('category') ? undefined : 'Category *'}
                placeholder="Select category"
                value={category}
                options={CATEGORIES}
                onSelect={v => {
                  setCategory(v);
                  const g = inferGenderForCategory(v);
                  if (g) setGender(g);
                }}
              />
            </View>

            {/* Who wears it — only when the category doesn't settle it */}
            {category && !inferredGender ? (
              <View style={styles.section}>
                <Select
                  label="Who's it for? *"
                  placeholder="Select"
                  value={gender}
                  options={Genders}
                  onSelect={v => setGender(v)}
                />
              </View>
            ) : null}

            {/* Colour */}
            <View style={styles.section}>
              {detectedFields.has('colour') && (
                <View style={styles.labelRow}>
                  <Text style={styles.sectionLabel}>Colour <Text style={styles.required}>*</Text></Text>
                  <Text style={styles.detectedTag}>Does this look right?</Text>
                </View>
              )}
              <Select
                label={detectedFields.has('colour') ? undefined : 'Colour *'}
                placeholder="Select colour"
                value={colour}
                options={Colours}
                onSelect={v => setColour(v)}
              />
            </View>

            {/* Occasion */}
            <View style={styles.section}>
              <Select
                label="Occasion (optional)"
                placeholder="Select occasion"
                value={occasion}
                options={Occasions}
                onSelect={v => setOccasion(v)}
              />
            </View>

            {/* Fabric weight */}
            <View style={[styles.section, { marginBottom: 0 }]}>
              <Select
                label="Fabric weight (optional)"
                placeholder="Select fabric weight"
                value={fabricWeight}
                options={FABRIC_WEIGHTS}
                onSelect={v => setFabricWeight(v)}
              />
            </View>
          </>
        )}
      </ScrollView>

      <BottomBar>
        <Button
          label={confirmMode === 'card' ? 'Looks right' : 'Find my fit'}
          variant="primary"
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{ flex: 1 }}
        />
      </BottomBar>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    scroll: {
      paddingBottom: Spacing['4xl'],
    },
    photo: {
      width: '100%',
      height: 320,
      borderRadius: BorderRadius.large,
      marginTop: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.large,
      padding: Spacing.lg,
      gap: Spacing.xs,
    },
    cardEyebrow: {
      ...Typography.micro,
      color: colors.textSecondary,
      ...FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: Spacing.xs,
    },
    cardHeadline: {
      ...Typography.subheading,
      color: colors.textPrimary,
    },
    cardDetail: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    cardMissing: {
      ...Typography.body,
      color: colors.textPrimary,
      marginTop: Spacing.sm,
    },
    changeLink: {
      marginTop: Spacing.base,
      alignSelf: 'flex-start',
    },
    changeLinkText: {
      ...Typography.label,
      color: colors.primary,
      ...FontFamily.semibold,
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
      ...FontFamily.semibold,
    },
    detectedTag: {
      ...Typography.micro,
      color: colors.textPrimary,
      ...FontFamily.semibold,
      backgroundColor: `${colors.secondary}33`,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    required: { color: colors.error },
    resultsNotes: { marginBottom: Spacing.xs },
    widenedNote: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
    gridContent: { flexGrow: 1, paddingTop: Spacing.base, paddingBottom: Spacing['4xl'] },
  });
}
