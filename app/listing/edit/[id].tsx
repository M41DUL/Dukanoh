import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { QueryStateView } from '@/components/QueryStateView';
import {
  Typography,
  Spacing,
  BorderRadius,
  BorderWidth,
  Genders,
  Categories,
  Conditions,
  Occasions,
  Sizes,
  Colours,
  Fabrics,
  ColorTokens,
} from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import {
  ActiveOrderExistsError,
  useDeleteListing,
  useUpdateListing,
} from '@/lib/mutations';
import {
  ListingForm,
  validateListing,
  buildMeasurements,
  CATEGORY_TO_GENDER,
} from '@/lib/sellHelpers';

const ALL_CATEGORIES = Categories.filter(c => c !== 'All');

type ListingStatus = 'draft' | 'available' | 'sold';

interface EditListingData {
  id: string;
  status: ListingStatus | null;
  title: string | null;
  description: string | null;
  price: number | null;
  gender: string | null;
  category: string | null;
  condition: string | null;
  occasion: string | null;
  size: string | null;
  colour: string | null;
  fabric: string | null;
  worn_at: string | null;
  measurements: { note?: string; chest?: string; waist?: string; length?: string | number } | null;
  images: string[] | null;
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: queryKeys.listings.detail(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, status, title, description, price, gender, category, condition, occasion, size, colour, fabric, worn_at, measurements, images')
        .eq('id', id!)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data as EditListingData;
    },
    enabled: !!id,
  });

  return (
    <ScreenWrapper>
      <Header title="Edit Listing" showBack />
      <QueryStateView
        query={query}
        isEmpty={!query.data}
        errorHeading="Couldn't load listing"
        empty={{
          heading: 'Listing not found',
          subtext: 'It may have been deleted.',
          ctaLabel: 'Go back',
          onCta: () => router.back(),
        }}
      >
        {query.data ? (
          <EditListingForm listing={query.data} listingId={id!} />
        ) : null}
      </QueryStateView>
    </ScreenWrapper>
  );
}

function initialMeasurementsNote(
  m: EditListingData['measurements'],
): string {
  if (!m) return '';
  if (m.note) return m.note;
  // Backwards-compat: old structured format {chest, waist, length}.
  const parts: string[] = [];
  if (m.chest) parts.push(`Chest ${m.chest}"`);
  if (m.waist) parts.push(`Waist ${m.waist}"`);
  if (m.length) parts.push(`Length ${m.length}"`);
  return parts.join(', ');
}

interface EditListingFormProps {
  listing: EditListingData;
  listingId: string;
}

function EditListingForm({ listing, listingId }: EditListingFormProps) {
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const updateListing = useUpdateListing();
  const deleteListingMutation = useDeleteListing();

  const [status] = useState<ListingStatus>(listing.status ?? 'draft');
  const [form, setForm] = useState<ListingForm>(() => ({
    title: listing.title ?? '',
    description: listing.description ?? '',
    price: listing.price?.toString() ?? '',
    gender: listing.gender ?? '',
    category: listing.category ?? '',
    condition: listing.condition ?? '',
    occasion: listing.occasion ?? '',
    size: listing.size ?? '',
    colour: listing.colour ?? '',
    fabric: listing.fabric ?? '',
    worn_at: listing.worn_at ?? '',
  }));
  const [measurementsNote, setMeasurementsNote] = useState(() =>
    initialMeasurementsNote(listing.measurements),
  );
  const [images, setImages] = useState<string[]>(listing.images ?? []);
  const [errors, setErrors] = useState<Partial<ListingForm & { images: string }>>({});

  const saving = updateListing.isPending;
  const deleting = deleteListingMutation.isPending;

  const update = (key: keyof ListingForm) => (value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const pickFromLibrary = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
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
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 8));
      setErrors(e => ({ ...e, images: undefined }));
    }
  };

  const takePhoto = async () => {
    const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 8));
      setErrors(e => ({ ...e, images: undefined }));
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const deleteListing = () => {
    Alert.alert(
      'Delete listing',
      'This will permanently remove your listing. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteListingMutation.mutate(
              { listingId, status, images },
              {
                onSuccess: () => router.dismissTo('/my-listings'),
                onError: err => {
                  if (err instanceof ActiveOrderExistsError) {
                    Alert.alert('Cannot delete', 'This listing has an active order in progress.');
                    return;
                  }
                  Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete listing.');
                },
              },
            );
          },
        },
      ],
    );
  };

  const validate = (): boolean => {
    const newErrors = validateListing(form, images.length, false);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const save = (newStatus: 'draft' | 'available') => {
    if (!validate() || !user) return;
    updateListing.mutate(
      {
        listingId,
        userId: user.id,
        patch: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          price: parseFloat(form.price),
          gender: form.gender || undefined,
          category: form.category,
          condition: form.condition,
          size: form.size || null,
          occasion: form.occasion || null,
          colour: form.colour || null,
          fabric: form.fabric || null,
          measurements: buildMeasurements(measurementsNote),
          worn_at: form.worn_at.trim() || null,
        },
        images,
        newStatus,
      },
      {
        onSuccess: () => router.dismissTo('/my-listings'),
        onError: err => {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save listing.');
        },
      },
    );
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Photos */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {images.map((uri, i) => (
            <View key={i} style={styles.imageThumb}>
              <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" transition={200} />
              <TouchableOpacity
                style={styles.removeImage}
                onPress={() => removeImage(i)}
                hitSlop={4}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
              {i === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverText}>Cover</Text>
                </View>
              )}
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
        {errors.images ? <Text style={styles.errorText}>{errors.images}</Text> : null}
      </View>

      <Input
        label="Title"
        required
        placeholder="e.g. Embroidered silk kurta set"
        value={form.title}
        onChangeText={update('title')}
        error={errors.title}
        maxLength={80}
        hint={`${form.title.length}/80`}
      />

      <Select
        label="Category"
        required
        placeholder="Select a category"
        value={form.category}
        options={ALL_CATEGORIES}
        onSelect={val => {
          const inferredGender = CATEGORY_TO_GENDER[val];
          setForm(f => ({ ...f, category: val, gender: inferredGender ?? f.gender }));
          setErrors(e => ({ ...e, category: undefined, gender: inferredGender ? undefined : e.gender }));
        }}
        error={errors.category}
      />

      {form.category && !CATEGORY_TO_GENDER[form.category] && (
        <Select
          label="Gender"
          required
          placeholder="Select gender"
          value={form.gender}
          options={Genders}
          onSelect={val => {
            setForm(f => ({ ...f, gender: val }));
            setErrors(e => ({ ...e, gender: undefined }));
          }}
          error={errors.gender}
        />
      )}

      <Input
        label="Description"
        required
        placeholder="Describe the fit, flaws, styling tips…"
        value={form.description}
        onChangeText={update('description')}
        error={errors.description}
        multiline
        numberOfLines={4}
        style={styles.multiline}
        maxLength={500}
        hint={`${form.description.length}/500`}
      />

      <Select
        label="Condition"
        required
        placeholder="Select condition"
        value={form.condition}
        options={Conditions}
        onSelect={val => {
          setForm(f => ({ ...f, condition: val }));
          setErrors(e => ({ ...e, condition: undefined }));
        }}
        error={errors.condition}
      />

      <Select
        label="Size"
        required
        placeholder="Select a size"
        value={form.size}
        options={Sizes}
        onSelect={val => {
          setForm(f => ({ ...f, size: val }));
          setErrors(e => ({ ...e, size: undefined }));
        }}
        error={errors.size}
      />

      <Input
        label="Price (£)"
        required
        placeholder="1.00 – 2,000.00"
        value={form.price}
        onChangeText={update('price')}
        keyboardType="decimal-pad"
        error={errors.price}
      />

      {/* Optional details */}
      <Select
        label="Colour"
        placeholder="Select a colour"
        value={form.colour}
        options={Colours}
        onSelect={val => setForm(f => ({ ...f, colour: f.colour === val ? '' : val }))}
      />

      <Select
        label="Fabric"
        placeholder="Select a fabric"
        value={form.fabric}
        options={Fabrics}
        onSelect={val => setForm(f => ({ ...f, fabric: f.fabric === val ? '' : val }))}
      />

      <Select
        label="Occasion"
        placeholder="Select an occasion"
        value={form.occasion}
        options={Occasions}
        onSelect={val => setForm(f => ({ ...f, occasion: f.occasion === val ? '' : val }))}
      />

      <Input
        label="Measurements"
        placeholder='e.g. Waist 28", length 42", blouse 36"'
        value={measurementsNote}
        onChangeText={setMeasurementsNote}
        maxLength={150}
      />

      <Input
        label="My story"
        placeholder="e.g. Worn once at Eid 2023 in Birmingham"
        value={form.worn_at}
        onChangeText={update('worn_at')}
        maxLength={100}
        hint={`${form.worn_at.length}/100`}
      />

      <View style={styles.submitRow}>
        {status === 'draft' ? (
          <>
            <Button
              label="Save draft"
              variant="outline"
              onPress={() => save('draft')}
              loading={saving}
              style={styles.draftBtn}
            />
            <Button
              label="Publish"
              onPress={() => save('available')}
              loading={saving}
              style={styles.listBtn}
            />
          </>
        ) : (
          <Button
            label="Save changes"
            onPress={() => save(status as 'available')}
            loading={saving}
            style={{ alignSelf: 'stretch', flex: 1 }}
          />
        )}
      </View>

      {status !== 'sold' && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={deleteListing}
          disabled={deleting || saving}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>
            {deleting ? 'Deleting…' : 'Delete listing'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['4xl'],
      gap: Spacing.base,
    },
    imageRow: { flexDirection: 'row' },
    imageThumb: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.medium,
      marginRight: Spacing.sm,
      overflow: 'hidden',
      position: 'relative',
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
    errorText: { ...Typography.caption, color: colors.error, marginTop: Spacing.xs },
    submitRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    draftBtn: { flex: 1 },
    listBtn: { flex: 2 },
    deleteBtn: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
    },
    deleteBtnText: {
      ...Typography.body,
      color: colors.error,
    },
  });
}
