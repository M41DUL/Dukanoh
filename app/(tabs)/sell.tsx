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
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SellerOnboarding } from '@/components/SellerOnboarding';
import { Select, SelectHandle } from '@/components/Select';
import { Typography, Spacing, BorderRadius, BorderWidth, Genders, CategoriesByGender, Conditions, Occasions, Sizes, Colours, Fabrics, ColorTokens } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { compressImage, compressImageForAnalysis } from '@/lib/imageUtils';
import { validateListing, buildMeasurements as buildMeasurementsHelper, isFormDirty as checkFormDirty, ListingForm } from '@/lib/sellHelpers';
import { useAuth } from '@/hooks/useAuth';

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
  const [measurements, setMeasurements] = useState({ chest: '', waist: '', length: '' });
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<'available' | 'draft' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<Partial<ListingForm & { images: string }>>({});
  const [coverWarnings, setCoverWarnings] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
  const chestRef = useRef<TextInput>(null);
  const waistRef = useRef<TextInput>(null);
  const lengthRef = useRef<TextInput>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxScroll = contentSize.height - layoutMeasurement.height;
    if (maxScroll > 0) {
      setScrollProgress(Math.min(contentOffset.y / maxScroll, 1));
    }
  }, []);

  const isFormDirty = checkFormDirty(form, measurements, images.length);

  // ── Cover quality check ───────────────────────────────────────────────────────
  const coverImage = images[0];
  const prevCoverRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!coverImage) { setCoverWarnings([]); return; }
    if (coverImage === prevCoverRef.current) return;
    prevCoverRef.current = coverImage;
    setCoverWarnings([]);
    compressImageForAnalysis(coverImage)
      .then(imageBase64 => supabase.functions.invoke('analyse-listing-image', {
        body: { imageBase64, check: 'quality' },
      }))
      .then(({ data }) => { setCoverWarnings(data?.warnings ?? []); })
      .catch(() => { /* fail open — no warnings shown */ });
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

  const runModeration = async (uri: string): Promise<boolean> => {
    try {
      const imageBase64 = await compressImageForAnalysis(uri);
      const { data } = await supabase.functions.invoke('analyse-listing-image', {
        body: { imageBase64, check: 'moderation' },
      });
      return data?.blocked === true;
    } catch {
      return false; // fail open
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
      const moderationResults = await Promise.all(uris.map(runModeration));
      const passed = uris.filter((_, i) => !moderationResults[i]);
      const blockedCount = uris.length - passed.length;

      if (blockedCount > 0) {
        Alert.alert(
          'Photo not allowed',
          blockedCount === 1
            ? 'One photo wasn\'t allowed and has been removed.'
            : `${blockedCount} photos weren't allowed and have been removed.`,
        );
      }

      if (passed.length > 0) {
        setImages(prev => [...prev, ...passed].slice(0, 8));
        setErrors(e => ({ ...e, images: undefined }));
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
      const blocked = await runModeration(uri);

      if (blocked) {
        Alert.alert('Photo not allowed', 'This image isn\'t allowed. Please try another.');
      } else {
        setImages(prev => [...prev, uri].slice(0, 8));
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
    const newErrors = validateListing(form, measurements, images.length, isDraft);
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
    setMeasurements({ chest: '', waist: '', length: '' });
    setShowMeasurements(false);
    setImages([]);
    setCoverWarnings([]);
    prevCoverRef.current = undefined;
  };

  const buildMeasurements = () => buildMeasurementsHelper(measurements);

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
        measurements: buildMeasurements(),
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
              <TouchableOpacity style={styles.addPhotoBtn} onPress={showPhotoOptions} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                <Text style={styles.addPhotoLabel}>
                  {images.length === 0 ? 'Add Photos' : 'Add More'}
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
            placeholder="e.g. Embroidered silk kurta set"
            value={form.title}
            onChangeText={update('title')}
            error={errors.title}
            maxLength={80}
            hint={`${form.title.length}/80`}
            returnKeyType="next"
            onSubmitEditing={() => { Keyboard.dismiss(); scrollToField('gender'); setTimeout(() => genderRef.current?.open(), 100); }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.gender = e.nativeEvent.layout.y; }}>
          <Select
            ref={genderRef}
            label="Gender"
            placeholder="Select gender"
            value={form.gender}
            options={Genders}
            onSelect={val => {
              setForm(f => {
                const categoryValid = CategoriesByGender[val as keyof typeof CategoriesByGender]?.includes(f.category);
                return { ...f, gender: val, category: categoryValid ? f.category : '' };
              });
              setErrors(e => ({ ...e, gender: undefined }));
              scrollToField('category');
              setTimeout(() => categoryRef.current?.open(), 300);
            }}
            error={errors.gender}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.category = e.nativeEvent.layout.y; }}>
          <Select
            ref={categoryRef}
            label="Category"
            placeholder={form.gender ? 'Select a category' : 'Select gender first'}
            value={form.category}
            options={form.gender ? CategoriesByGender[form.gender as keyof typeof CategoriesByGender] : []}
            emptyMessage="Please select a gender first"
            onSelect={val => {
              setForm(f => ({ ...f, category: val }));
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

        <View style={styles.measureSection} onLayout={e => { fieldPositions.current.size = e.nativeEvent.layout.y; }}>
          <Select
            ref={sizeRef}
            label="Size"
            placeholder="Select a size"
            value={form.size}
            options={Sizes}
            onSelect={val => {
              setForm(f => ({ ...f, size: val }));
              setErrors(e => ({ ...e, size: undefined }));
              if (val === 'Custom') setShowMeasurements(true);
              else { scrollToField('colour'); setTimeout(() => colourRef.current?.open(), 300); }
            }}
            error={errors.size}
          />
          {!showMeasurements && (
            <TouchableOpacity onPress={() => setShowMeasurements(true)}>
              <Text style={styles.addMeasurementsLink}>+ Add measurements (optional)</Text>
            </TouchableOpacity>
          )}
          {showMeasurements && (
            <>
              <Text style={styles.optionalLabel}>Measurements (in inches)</Text>
              <Input
                ref={chestRef}
                label="Chest"
                placeholder="e.g. 38"
                value={measurements.chest}
                onChangeText={v => setMeasurements(m => ({ ...m, chest: v }))}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => waistRef.current?.focus()}
              />
              <Input
                ref={waistRef}
                label="Waist"
                placeholder="e.g. 32"
                value={measurements.waist}
                onChangeText={v => setMeasurements(m => ({ ...m, waist: v }))}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => lengthRef.current?.focus()}
              />
              <Input
                ref={lengthRef}
                label="Length"
                placeholder="e.g. 44"
                value={measurements.length}
                onChangeText={v => setMeasurements(m => ({ ...m, length: v }))}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => { Keyboard.dismiss(); scrollToField('colour'); setTimeout(() => colourRef.current?.open(), 100); }}
              />
            </>
          )}
        </View>

        <View onLayout={e => { fieldPositions.current.colour = e.nativeEvent.layout.y; }}>
          <Select
            ref={colourRef}
            label="Colour (optional)"
            placeholder="Select a colour"
            value={form.colour}
            options={Colours}
            onSelect={val => {
              setForm(f => ({ ...f, colour: f.colour === val ? '' : val }));
              scrollToField('fabric');
              setTimeout(() => fabricRef.current?.open(), 300);
            }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.fabric = e.nativeEvent.layout.y; }}>
          <Select
            ref={fabricRef}
            label="Fabric (optional)"
            placeholder="Select a fabric"
            value={form.fabric}
            options={Fabrics}
            onSelect={val => {
              setForm(f => ({ ...f, fabric: f.fabric === val ? '' : val }));
              scrollToField('occasion');
              setTimeout(() => occasionRef.current?.open(), 300);
            }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.occasion = e.nativeEvent.layout.y; }}>
          <Select
            ref={occasionRef}
            label="Occasion (optional)"
            placeholder="Select an occasion"
            value={form.occasion}
            options={Occasions}
            onSelect={val => {
              setForm(f => ({ ...f, occasion: f.occasion === val ? '' : val }));
              scrollToField('price');
              setTimeout(() => priceRef.current?.focus(), 300);
            }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.price = e.nativeEvent.layout.y; }}>
          <Input
            ref={priceRef}
            label="Price (£)"
            placeholder="1.00 – 2,000.00"
            value={form.price}
            onChangeText={update('price')}
            keyboardType="decimal-pad"
            error={errors.price}
            returnKeyType="next"
            onSubmitEditing={() => { Keyboard.dismiss(); scrollToField('worn_at'); setTimeout(() => storyRef.current?.focus(), 100); }}
          />
        </View>

        <View onLayout={e => { fieldPositions.current.worn_at = e.nativeEvent.layout.y; }}>
        <Input
          ref={storyRef}
          label="My story (optional)"
          placeholder="e.g. Worn once at Eid 2023 in Birmingham"
          value={form.worn_at}
          onChangeText={update('worn_at')}
          maxLength={100}
          hint={`${form.worn_at.length}/100`}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        </View>

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

function getStyles(colors: ColorTokens) {
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
    addPhotoLabel: { ...Typography.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
    addPhotoSub: { ...Typography.caption, color: colors.textSecondary },
    multiline: { height: 100, textAlignVertical: 'top' },
    optionalLabel: { ...Typography.caption, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
    measureSection: { gap: Spacing.base },
    addMeasurementsLink: { ...Typography.caption, color: colors.primaryText, fontFamily: 'Inter_600SemiBold' },
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
