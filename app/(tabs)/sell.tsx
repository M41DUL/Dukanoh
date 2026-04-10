import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { GradientCard } from '@/components/GradientCard';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SellerOnboarding } from '@/components/SellerOnboarding';
import { Select, SelectHandle } from '@/components/Select';
import { Typography, Spacing, BorderRadius, BorderWidth, Genders, Categories, Conditions, Occasions, Sizes, Colours, Fabrics, ColorTokens } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { compressImage, compressImageForAnalysis } from '@/lib/imageUtils';
import { validateListing, buildMeasurements, isFormDirty as checkFormDirty, ListingForm, CATEGORY_TO_GENDER } from '@/lib/sellHelpers';
import { useAuth } from '@/hooks/useAuth';

const FN_KEY = { 'x-dukanoh-key': process.env.EXPO_PUBLIC_INTERNAL_API_KEY ?? '' };

const ALL_CATEGORIES = Categories.filter(c => c !== 'All') as string[];

export default function SellScreen() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [sellerStatus, setSellerStatus] = useState<'loading' | 'not_seller' | 'seller'>('loading');

  useFocusEffect(useCallback(() => {
    if (!user) return;
    supabase.from('users').select('is_seller').eq('id', user.id).single().then(({ data }) => {
      setSellerStatus(data?.is_seller ? 'seller' : 'not_seller');
    });
  }, [user]));
  const emptyForm: ListingForm = {
    title: '', description: '', price: '', gender: '', category: '',
    condition: '', occasion: '', size: '', colour: '', fabric: '', worn_at: '',
  };
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [measurementsNote, setMeasurementsNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState<'available' | 'draft' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<Partial<ListingForm & { images: string }>>({});
  const [coverWarnings, setCoverWarnings] = useState<string[]>([]);
  const [analysingImages, setAnalysingImages] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;;
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const scrollRef = useRef<any>(null);
  const fieldPositions = useRef<Record<string, number>>({});
  const descRef = useRef<TextInput>(null);
  const storyRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const genderRef = useRef<SelectHandle>(null);
  const categoryRef = useRef<SelectHandle>(null);
  const conditionRef = useRef<SelectHandle>(null);
  const sizeRef = useRef<SelectHandle>(null);
  const colourRef = useRef<SelectHandle>(null);
  const fabricRef = useRef<SelectHandle>(null);
  const occasionRef = useRef<SelectHandle>(null);
  const measurementsRef = useRef<TextInput>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxScroll = contentSize.height - layoutMeasurement.height;
    if (maxScroll > 0) {
      setScrollProgress(Math.min(contentOffset.y / maxScroll, 1));
    }
  }, []);

  const isFormDirty = checkFormDirty(form, measurementsNote, images.length);

  // ── Cover quality check ───────────────────────────────────────────────────────
  const coverImage = images[0];
  const prevCoverRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!coverImage) { setCoverWarnings([]); return; }
    if (coverImage === prevCoverRef.current) return;
    prevCoverRef.current = coverImage;
    setCoverWarnings([]);

    let cancelled = false;
    (async () => {
      try {
        const imageBase64 = await compressImageForAnalysis(coverImage);
        if (cancelled) return;
        const invoke = supabase.functions.invoke('analyse-listing-image', {
          body: { imageBase64, check: 'quality' },
          headers: FN_KEY,
        });
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        );
        const { data } = await Promise.race([invoke, timeout]);
        if (!cancelled) setCoverWarnings(data?.warnings ?? []);
      } catch {
        // fail open — no warnings shown
      }
    })();
    return () => { cancelled = true; };
  }, [coverImage]);

  const formDirtyRef = useRef(isFormDirty);
  const submittingRef = useRef(submitting);
  const resetFormRef = useRef<(() => void) | null>(null);
  const submitListingRef = useRef<((status: 'available' | 'draft') => void) | null>(null);
  useEffect(() => {
    formDirtyRef.current = isFormDirty;
    submittingRef.current = submitting;
    resetFormRef.current = resetForm;
    submitListingRef.current = submitListing;
  });

  useFocusEffect(useCallback(() => {
    return () => {
      // Runs when tab loses focus — checked via ref to avoid stale closure
      if (formDirtyRef.current && !submittingRef.current) {
        Alert.alert(
          'Save draft?',
          'You have unsaved changes.',
          [
            { text: 'Discard', style: 'destructive', onPress: () => resetFormRef.current?.() },
            { text: 'Save draft', onPress: () => submitListingRef.current?.('draft') },
          ]
        );
      }
    };
  }, []));

  const update = (key: keyof ListingForm) => (value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const scrollToField = (field: string) => {
    const y = fieldPositions.current[field];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  type CheckResult = { status: 'ok'; detectedColour?: string } | { status: 'blocked' } | { status: 'not-clothing' };

  // Runs moderation + clothing check in parallel.
  const runChecks = async (uri: string): Promise<CheckResult> => {
    try {
      const imageBase64 = await compressImageForAnalysis(uri);
      const timeout = <T,>(p: Promise<T>) => Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);

      const [modResult, clothingResult] = await Promise.all([
        timeout(supabase.functions.invoke('analyse-listing-image', {
          body: { imageBase64, check: 'moderation' },
          headers: FN_KEY,
        })).catch(() => ({ data: { blocked: false } })),
        timeout(supabase.functions.invoke('validate-clothing', {
          body: { imageBase64 },
          headers: FN_KEY,
        })).catch(() => ({ data: { isClothing: true } })), // fail open
      ]);

      if ((modResult as { data: { blocked?: boolean } }).data?.blocked) return { status: 'blocked' };
      const cd = (clothingResult as { data: { isClothing?: boolean; detectedColour?: string } }).data;
      if (cd?.isClothing === false) return { status: 'not-clothing' };
      return { status: 'ok', detectedColour: cd?.detectedColour };
    } catch {
      return { status: 'ok' }; // fail open
    }
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 8 - images.length,
    });

    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setAnalysingImages(true);
      try {
        const checkResults = await Promise.all(uris.map(runChecks));
        const passed = uris.filter((_, i) => checkResults[i].status === 'ok');
        const blockedCount = checkResults.filter(r => r.status === 'blocked').length;
        const notClothingCount = checkResults.filter(r => r.status === 'not-clothing').length;

        if (blockedCount > 0) {
          Alert.alert(
            'Photo not allowed',
            blockedCount === 1
              ? "One photo wasn't allowed and has been removed."
              : `${blockedCount} photos weren't allowed and have been removed.`,
          );
        }
        if (notClothingCount > 0) {
          Alert.alert(
            'Not a clothing item',
            notClothingCount === 1
              ? "One photo doesn't appear to show clothing and has been removed."
              : `${notClothingCount} photos don't appear to show clothing and have been removed.`,
          );
        }

        if (passed.length > 0) {
          setImages(prev => {
            const isFirstPhoto = prev.length === 0;
            if (isFirstPhoto) {
              const firstResult = checkResults[uris.indexOf(passed[0])];
              const detected = firstResult.status === 'ok' ? firstResult.detectedColour : undefined;
              if (detected) {
                setForm(f => ({ ...f, colour: f.colour || detected }));
              }
            }
            return [...prev, ...passed].slice(0, 8);
          });
          setErrors(e => ({ ...e, images: undefined }));
        }
      } finally {
        setAnalysingImages(false);
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your camera.');
      return;
    }

    let currentCount = images.length;

    while (currentCount < 8) {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (result.canceled) break;

      const uri = result.assets[0].uri;
      setAnalysingImages(true);
      const checkResult = await runChecks(uri).finally(() => setAnalysingImages(false));

      if (checkResult.status === 'blocked') {
        Alert.alert('Photo not allowed', "This image isn't allowed. Please try another.");
        break;
      } else if (checkResult.status === 'not-clothing') {
        Alert.alert('Not a clothing item', "Please take a photo of the clothing piece you want to sell.");
        break;
      } else {
        setImages(prev => {
          const detected = checkResult.status === 'ok' ? checkResult.detectedColour : undefined;
          if (prev.length === 0 && detected) {
            setForm(f => ({ ...f, colour: f.colour || detected }));
          }
          return [...prev, uri].slice(0, 8);
        });
        setErrors(e => ({ ...e, images: undefined }));
        currentCount += 1;
      }

      // Let camera UI fully dismiss before reopening
      if (currentCount < 8) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const [reorderIndex, setReorderIndex] = useState<number | null>(null);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setReorderIndex(null);
  };

  const moveImage = (from: number, to: number) => {
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setReorderIndex(to);
  };

  const validate = (isDraft: boolean): boolean => {
    const newErrors = validateListing(form, images.length, isDraft);
    setErrors(newErrors);

    const errorKeys = Object.keys(newErrors);
    if (errorKeys.length > 0) {
      const firstErrorY = fieldPositions.current[errorKeys[0]];
      if (firstErrorY !== undefined) {
        scrollRef.current?.scrollTo({ y: firstErrorY, animated: true });
      }
    }

    return errorKeys.length === 0;
  };

  const uploadImages = async (): Promise<string[]> => {
    if (!user) return [];

    setUploadProgress({ done: 0, total: images.length });

    const uploads = images.map(async (uri) => {
      const compressed = await compressImage(uri);
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

      const response = await fetch(compressed);
      const arrayBuffer = await response.arrayBuffer();

      const { error } = await supabase.storage
        .from('listings')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
        });

      if (error) throw new Error(`Failed to upload photo: ${error.message}`);

      setUploadProgress(prev => ({ ...prev, done: prev.done + 1 }));

      const { data } = supabase.storage.from('listings').getPublicUrl(fileName);
      return data.publicUrl;
    });

    return Promise.all(uploads);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setMeasurementsNote('');
    setShowDetails(false);
    setImages([]);
    setCoverWarnings([]);
    prevCoverRef.current = undefined;
  };

  const submitListing = async (status: 'available' | 'draft') => {
    if (!validate(status === 'draft') || !user) return;
    Keyboard.dismiss();

    setSubmitting(status);
    try {
      const imageUrls = await uploadImages();

      const { error } = await supabase.from('listings').insert({
        seller_id: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        gender: form.gender,
        category: form.category,
        condition: form.condition,
        size: form.size || null,
        occasion: form.occasion || null,
        colour: form.colour || null,
        fabric: form.fabric || null,
        measurements: buildMeasurements(measurementsNote),
        worn_at: form.worn_at.trim() || null,
        images: imageUrls,
        status,
      });

      if (error) throw error;

      if (status === 'available') {
        setShowSuccess(true);
        successAnim.setValue(0);
        Animated.spring(successAnim, { toValue: 1, speed: 8, bounciness: 10, useNativeDriver: true }).start();
      } else {
        Alert.alert('Draft saved', 'Find it in your profile to publish when ready.', [
          { text: 'OK', onPress: resetForm },
        ]);
      }
    } catch (err: unknown) {
      const action = status === 'draft' ? 'save draft' : 'create listing';
      Alert.alert('Error', err instanceof Error ? err.message : `Failed to ${action}.`);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = () => submitListing('available');

  if (sellerStatus === 'loading') {
    return (
      <ScreenWrapper>
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  if (sellerStatus === 'not_seller') {
    if (!user) return null;
    return (
      <>
        {isFocused && <StatusBar style="light" />}
        <SellerOnboarding
          userId={user.id}
          onActivated={() => setSellerStatus('seller')}
        />
      </>
    );
  }

  if (showSuccess) {
    return (
      <ScreenWrapper>
        <View style={styles.successContainer}>
          <Animated.View style={[styles.successCircle, {
            transform: [{ scale: successAnim }],
            opacity: successAnim,
          }]}>
            <Ionicons name="checkmark" size={48} color="#fff" />
          </Animated.View>
          <Animated.Text style={[styles.successTitle, { opacity: successAnim }]}>
            You're live!
          </Animated.Text>
          <Animated.Text style={[styles.successSubtitle, { opacity: successAnim }]}>
            Your piece is now listed and visible to members.
          </Animated.Text>
          <View style={styles.successActions}>
            <Button
              label="View profile"
              variant="outline"
              onPress={() => { setShowSuccess(false); resetForm(); router.push('/(tabs)/profile'); }}
              style={styles.successBtn}
              borderColor={colors.border}
              textColor={colors.textPrimary}
            />
            <Button
              label="List another"
              onPress={() => { setShowSuccess(false); resetForm(); }}
              style={styles.successBtn}
            />
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.padded}>
        <Header title="New Listing" />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${scrollProgress * 100}%` }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* ── Photos ───────────────────────────────── */}
        <View style={styles.imageRowOuter} onLayout={e => { fieldPositions.current.images = e.nativeEvent.layout.y; }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRowInner}>
            {images.map((uri, i) => (
              <View key={uri} style={[styles.imageThumb, reorderIndex === i && styles.imageThumbActive]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onLongPress={() => setReorderIndex(reorderIndex === i ? null : i)}
                  delayLongPress={200}
                  style={StyleSheet.absoluteFill}
                >
                  <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" transition={200} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeImage}
                  onPress={() => removeImage(i)}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
                {reorderIndex === i && (
                  <View style={styles.reorderControls}>
                    {i > 0 && (
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => moveImage(i, i - 1)}>
                        <Ionicons name="chevron-back" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {i < images.length - 1 && (
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => moveImage(i, i + 1)}>
                        <Ionicons name="chevron-forward" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {i === 0 && <View style={styles.coverBadge}><Text style={styles.coverText}>Cover</Text></View>}
              </View>
            ))}
            {images.length < 8 && (
              <TouchableOpacity
                style={[styles.addPhotoBtn, analysingImages && styles.addPhotoBtnDisabled]}
                onPress={analysingImages ? undefined : showPhotoOptions}
                activeOpacity={0.8}
              >
                {analysingImages ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                )}
                <Text style={styles.addPhotoLabel}>
                  {analysingImages ? 'Checking…' : images.length === 0 ? 'Add Photos' : 'Add More'}
                </Text>
                <Text style={styles.addPhotoSub}>{images.length}/8</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
{coverWarnings.length > 0 && (
            <View style={styles.warningBanner}>
              {coverWarnings.map((w, i) => (
                <View key={i} style={styles.warningRow}>
                  <Ionicons name="warning-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.warningText}>{w}</Text>
                </View>
              ))}
            </View>
          )}
          {errors.images ? <Text style={[styles.errorText, styles.imageErrorPadded]}>{errors.images}</Text> : null}
        </View>

        <View onLayout={e => { fieldPositions.current.title = e.nativeEvent.layout.y; }}>
          <Input
            label="Title"
            required
            placeholder="e.g. Embroidered silk kurta set"
            value={form.title}
            onChangeText={update('title')}
            error={errors.title}
            maxLength={80}
            hint={`${form.title.length}/80`}
            returnKeyType="next"
            onSubmitEditing={() => { Keyboard.dismiss(); scrollToField('category'); setTimeout(() => categoryRef.current?.open(), 100); }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.category = e.nativeEvent.layout.y; }}>
          <Select
            ref={categoryRef}
            label="Category"
            required
            placeholder="Select a category"
            value={form.category}
            options={ALL_CATEGORIES}
            onSelect={val => {
              const inferredGender = CATEGORY_TO_GENDER[val];
              setForm(f => ({ ...f, category: val, gender: inferredGender ?? f.gender }));
              setErrors(e => ({ ...e, category: undefined }));
              scrollToField('description');
              setTimeout(() => descRef.current?.focus(), 300);
            }}
            error={errors.category}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.description = e.nativeEvent.layout.y; }}>
          <Input
            ref={descRef}
            label="Description"
            required
            placeholder="Describe your item — fit, flaws, styling tips…"
            value={form.description}
            onChangeText={update('description')}
            error={errors.description}
            multiline
            numberOfLines={4}
            style={styles.multiline}
            maxLength={500}
            hint={`${form.description.length}/500`}
            blurOnSubmit
            returnKeyType="next"
            onSubmitEditing={() => { Keyboard.dismiss(); scrollToField('condition'); setTimeout(() => conditionRef.current?.open(), 100); }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.condition = e.nativeEvent.layout.y; }}>
          <Select
            ref={conditionRef}
            label="Condition"
            required
            placeholder="Select condition"
            value={form.condition}
            options={Conditions}
            onSelect={val => {
              setForm(f => ({ ...f, condition: val }));
              setErrors(e => ({ ...e, condition: undefined }));
              scrollToField('size');
              setTimeout(() => sizeRef.current?.open(), 300);
            }}
            error={errors.condition}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.size = e.nativeEvent.layout.y; }}>
          <Select
            ref={sizeRef}
            label="Size"
            required
            placeholder="Select a size"
            value={form.size}
            options={Sizes}
            onSelect={val => {
              setForm(f => ({ ...f, size: val }));
              setErrors(e => ({ ...e, size: undefined }));
              if (val === 'Custom') {
                setShowDetails(true);
              } else {
                scrollToField('price');
                setTimeout(() => priceRef.current?.focus(), 300);
              }
            }}
            error={errors.size}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.price = e.nativeEvent.layout.y; }}>
          <Input
            ref={priceRef}
            label="Price (£)"
            required
            placeholder="1.00 – 2,000.00"
            value={form.price}
            onChangeText={update('price')}
            keyboardType="decimal-pad"
            error={errors.price}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        {/* ── Sell faster toggle ────────────────────────────── */}
        <GradientCard
          colors={isDark ? ['rgba(199,247,94,0.12)', colors.surface] : ['#E8FBC5', colors.surface]}
          title="Sell faster"
          subtitle={showDetails ? 'More details help buyers find your piece' : 'Add colour, fabric, occasion and more'}
          onPress={() => setShowDetails(d => !d)}
          left={
            <View style={styles.sellFasterIcon}>
              <Ionicons name="flash" size={20} color={isDark ? colors.secondary : colors.textPrimary} />
            </View>
          }
          right={
            <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          }
        />

        {/* ── Optional details ──────────────────────────────── */}
        {showDetails && (
          <>
            <View onLayout={e => { fieldPositions.current.gender = e.nativeEvent.layout.y; }}>
              <Select
                ref={genderRef}
                label="Gender"
                placeholder="Select gender"
                value={form.gender}
                options={Genders as unknown as string[]}
                onSelect={val => {
                  setForm(f => ({ ...f, gender: val }));
                }}
              />
            </View>

            <View onLayout={e => { fieldPositions.current.colour = e.nativeEvent.layout.y; }}>
              <Select
                ref={colourRef}
                label="Colour"
                placeholder="Select a colour"
                value={form.colour}
                options={Colours}
                onSelect={val => {
                  setForm(f => ({ ...f, colour: f.colour === val ? '' : val }));
                }}
              />
            </View>

            <View onLayout={e => { fieldPositions.current.fabric = e.nativeEvent.layout.y; }}>
              <Select
                ref={fabricRef}
                label="Fabric"
                placeholder="Select a fabric"
                value={form.fabric}
                options={Fabrics}
                onSelect={val => {
                  setForm(f => ({ ...f, fabric: f.fabric === val ? '' : val }));
                }}
              />
            </View>

            <View onLayout={e => { fieldPositions.current.occasion = e.nativeEvent.layout.y; }}>
              <Select
                ref={occasionRef}
                label="Occasion"
                placeholder="Select an occasion"
                value={form.occasion}
                options={Occasions}
                onSelect={val => {
                  setForm(f => ({ ...f, occasion: f.occasion === val ? '' : val }));
                }}
              />
            </View>

            <Input
              ref={measurementsRef}
              label="Measurements"
              placeholder='e.g. Waist 28", length 42", blouse 36"'
              value={measurementsNote}
              onChangeText={setMeasurementsNote}
              maxLength={150}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />

            <View onLayout={e => { fieldPositions.current.worn_at = e.nativeEvent.layout.y; }}>
              <Input
                ref={storyRef}
                label="My story"
                placeholder="e.g. Worn once at Eid 2023 in Birmingham"
                value={form.worn_at}
                onChangeText={update('worn_at')}
                maxLength={100}
                hint={`${form.worn_at.length}/100`}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>
          </>
        )}

        {submitting && uploadProgress.total > 0 && (
          <Text style={styles.progressText}>
            Uploading photos… {uploadProgress.done}/{uploadProgress.total}
          </Text>
        )}
        <Button
          label="List Piece"
          onPress={handleSubmit}
          loading={submitting === 'available'}
          disabled={!!submitting}
          style={styles.submitBtn}
        />
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens, isDark: boolean) {
  return StyleSheet.create({
    progressBar: {
      height: 2,
      backgroundColor: colors.border,
    },
    progressFill: {
      height: 2,
      backgroundColor: colors.primary,
    },
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing.base,
      paddingHorizontal: Spacing.base,
      gap: Spacing.xl,
    },
    padded: {
      paddingHorizontal: Spacing.base,
    },
    sectionHeader: {
      ...Typography.subheading,
      color: colors.textPrimary,
      fontSize: 15,
      marginBottom: -Spacing.xs,
    },
    imageRowOuter: { marginHorizontal: -Spacing.base },
    imageRowInner: { paddingHorizontal: Spacing.base, gap: Spacing.sm },
    imageThumb: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.medium,
      overflow: 'hidden',
      position: 'relative',
    },
    imageThumbActive: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    reorderControls: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.sm,
      paddingVertical: 6,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    reorderBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbImage: { width: '100%', height: '100%' },
    removeImage: {
      position: 'absolute',
      top: 4,
      right: 4,
    },
    coverBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    coverText: {
      ...Typography.caption,
      color: '#fff',
      fontSize: 10,
    },
    addPhotoBtn: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.medium,
      borderWidth: BorderWidth.standard,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    addPhotoBtnDisabled: { opacity: 0.5 },
    addPhotoLabel: { ...Typography.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
    addPhotoSub: { ...Typography.caption, color: colors.textSecondary },
    multiline: { height: 100, textAlignVertical: 'top' },
    sellFasterIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(199,247,94,0.15)' : 'rgba(0,0,0,0.08)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    errorText: { ...Typography.caption, color: colors.error, marginTop: Spacing.xs },
    imageErrorPadded: { paddingHorizontal: Spacing.base },
    warningBanner: {
      marginHorizontal: Spacing.base,
      marginTop: Spacing.sm,
      gap: Spacing.xs,
    },
    warningRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: Spacing.xs,
    },
    warningText: { ...Typography.caption, color: colors.textSecondary, flex: 1 },
    progressText: { ...Typography.caption, color: colors.textSecondary, textAlign: 'center' as const },
    submitBtn: { marginTop: Spacing.sm },
    successContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
    },
    successCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xl,
    },
    successTitle: {
      ...Typography.heading,
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
    },
    successSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      marginBottom: Spacing['2xl'],
    },
    successActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      width: '100%',
    },
    successBtn: { flex: 1 },
  });
}
