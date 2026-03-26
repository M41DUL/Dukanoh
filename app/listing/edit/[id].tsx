import React, { useState, useEffect, useMemo } from 'react';
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
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Select } from '@/components/Select';
import { Typography, Spacing, BorderRadius, BorderWidth, Genders, CategoriesByGender, Conditions, Occasions, Sizes, Colours, Fabrics, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';
import { useAuth } from '@/hooks/useAuth';

interface ListingForm {
  title: string;
  description: string;
  price: string;
  gender: string;
  category: string;
  condition: string;
  occasion: string;
  size: string;
  colour: string;
  fabric: string;
  worn_at: string;
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'draft' | 'available' | 'sold'>('draft');
  const [form, setForm] = useState<ListingForm>({
    title: '', description: '', price: '', gender: '', category: '',
    condition: '', occasion: '', size: '', colour: '', fabric: '', worn_at: '',
  });
  const [measurements, setMeasurements] = useState({ chest: '', waist: '', length: '' });
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<ListingForm & { images: string }>>({});

  useEffect(() => {
    if (!id) return;
    supabase.from('listings').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) { router.back(); return; }
      setStatus(data.status);
      setForm({
        title: data.title ?? '',
        description: data.description ?? '',
        price: data.price?.toString() ?? '',
        gender: data.gender ?? '',
        category: data.category ?? '',
        condition: data.condition ?? '',
        occasion: data.occasion ?? '',
        size: data.size ?? '',
        colour: data.colour ?? '',
        fabric: data.fabric ?? '',
        worn_at: data.worn_at ?? '',
      });
      const m = data.measurements;
      setMeasurements({
        chest: m?.chest?.toString() ?? '',
        waist: m?.waist?.toString() ?? '',
        length: m?.length?.toString() ?? '',
      });
      if (m?.chest || m?.waist || m?.length) setShowMeasurements(true);
      setImages(data.images ?? []);
      setLoading(false);
    });
  }, [id]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!form.title.trim()) newErrors.title = 'Title is required';
    else if (form.title.trim().length < 3) newErrors.title = 'Title must be at least 3 characters';
    if (!form.description.trim()) newErrors.description = 'Description is required';
    else if (form.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';
    const price = parseFloat(form.price);
    if (!form.price.trim() || isNaN(price) || price < 1) newErrors.price = 'Enter a price of at least £1';
    else if (price > 2000) newErrors.price = 'Maximum price is £2,000';
    if (!form.gender) newErrors.gender = 'Select a gender';
    if (!form.category) newErrors.category = 'Select a category';
    if (!form.condition) newErrors.condition = 'Select a condition';
    if (!form.size) newErrors.size = 'Select a size';
    if (images.length === 0) newErrors.images = 'Add at least one photo';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadNewImages = async (): Promise<string[]> => {
    if (!user) return [];
    const result: string[] = [];
    for (const uri of images) {
      if (uri.startsWith('http')) {
        result.push(uri);
        continue;
      }
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
      const { data } = supabase.storage.from('listings').getPublicUrl(fileName);
      result.push(data.publicUrl);
    }
    return result;
  };

  const buildMeasurements = () => {
    const chest = parseFloat(measurements.chest);
    const waist = parseFloat(measurements.waist);
    const length = parseFloat(measurements.length);
    const obj: Record<string, number> = {};
    if (!isNaN(chest) && chest > 0) obj.chest = chest;
    if (!isNaN(waist) && waist > 0) obj.waist = waist;
    if (!isNaN(length) && length > 0) obj.length = length;
    return Object.keys(obj).length > 0 ? obj : null;
  };

  const save = async (newStatus: 'draft' | 'available') => {
    if (!validate() || !id) return;
    setSaving(true);
    try {
      const imageUrls = await uploadNewImages();
      const { error } = await supabase.from('listings').update({
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
        status: newStatus,
      }).eq('id', id);
      if (error) throw error;
      router.back();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save listing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <ScreenWrapper>
      <Header title="Edit Listing" showBack />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image picker */}
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
          {errors.images ? <Text style={styles.errorText}>{errors.images}</Text> : null}
        </View>

        <Input
          label="Title"
          placeholder="e.g. Embroidered silk kurta set"
          value={form.title}
          onChangeText={update('title')}
          error={errors.title}
          maxLength={80}
        />
        <Input
          label="Description"
          placeholder="Describe your item — fit, flaws, styling tips…"
          value={form.description}
          onChangeText={update('description')}
          error={errors.description}
          multiline
          numberOfLines={4}
          style={styles.multiline}
          maxLength={500}
        />
        <Input
          label="My story (optional)"
          placeholder="e.g. Worn once at Eid 2023 in Birmingham"
          value={form.worn_at}
          onChangeText={update('worn_at')}
          maxLength={100}
        />
        <Input
          label="Price (£)"
          placeholder="1.00 – 2,000.00"
          value={form.price}
          onChangeText={update('price')}
          keyboardType="decimal-pad"
          error={errors.price}
        />

        <Select
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
          }}
          error={errors.gender}
        />

        <Select
          label="Category"
          placeholder={form.gender ? 'Select a category' : 'Select gender first'}
          value={form.category}
          options={form.gender ? CategoriesByGender[form.gender as keyof typeof CategoriesByGender] : []}
          onSelect={val => {
            setForm(f => ({ ...f, category: val }));
            setErrors(e => ({ ...e, category: undefined }));
          }}
          error={errors.category}
        />

        <Select
          label="Condition"
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
          label="Occasion (optional)"
          placeholder="Select an occasion"
          value={form.occasion}
          options={Occasions}
          onSelect={val => setForm(f => ({ ...f, occasion: f.occasion === val ? '' : val }))}
        />

        {/* Sizing section */}
        <View style={styles.sizingSection}>
          <Text style={styles.sectionLabel}>Sizing</Text>
          <Select
            label="Size"
            placeholder="Select a size"
            value={form.size}
            options={Sizes}
            onSelect={val => {
              setForm(f => ({ ...f, size: val }));
              setErrors(e => ({ ...e, size: undefined }));
              if (val === 'Custom') setShowMeasurements(true);
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
              <Input label="Chest" placeholder="e.g. 38" value={measurements.chest} onChangeText={v => setMeasurements(m => ({ ...m, chest: v }))} keyboardType="decimal-pad" />
              <Input label="Waist" placeholder="e.g. 32" value={measurements.waist} onChangeText={v => setMeasurements(m => ({ ...m, waist: v }))} keyboardType="decimal-pad" />
              <Input label="Length" placeholder="e.g. 44" value={measurements.length} onChangeText={v => setMeasurements(m => ({ ...m, length: v }))} keyboardType="decimal-pad" />
            </>
          )}
        </View>

        <Select
          label="Colour (optional)"
          placeholder="Select a colour"
          value={form.colour}
          options={Colours}
          onSelect={val => setForm(f => ({ ...f, colour: f.colour === val ? '' : val }))}
        />

        <Select
          label="Fabric (optional)"
          placeholder="Select a fabric"
          value={form.fabric}
          options={Fabrics}
          onSelect={val => setForm(f => ({ ...f, fabric: f.fabric === val ? '' : val }))}
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
      </ScrollView>
    </ScreenWrapper>
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
    sectionLabel: {
      ...Typography.label,
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
    },
    sizingSection: { gap: Spacing.base },
    addMeasurementsLink: { ...Typography.caption, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
    optionalLabel: { ...Typography.caption, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
    errorText: { ...Typography.caption, color: colors.error, marginTop: Spacing.xs },
    submitRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    draftBtn: { flex: 1 },
    listBtn: { flex: 2 },
  });
}
