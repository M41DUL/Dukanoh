import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Typography, Spacing, BorderRadius, BorderWidth, Categories, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';
import { useAuth } from '@/hooks/useAuth';

const SELL_CATEGORIES = Categories.filter(c => c !== 'All');
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair'] as const;
const OCCASIONS = ['Everyday', 'Eid', 'Diwali', 'Wedding', 'Mehndi', 'Party', 'Formal'] as const;

interface ListingForm {
  title: string;
  description: string;
  price: string;
  size: string;
  category: string;
  condition: string;
  occasion: string;
  worn_at: string;
}

export default function SellScreen() {
  const { user } = useAuth();

  useFocusEffect(useCallback(() => {
    if (!user) return;
    supabase.from('users').select('is_seller').eq('id', user.id).single().then(({ data }) => {
      if (!data?.is_seller) router.replace('/become-seller');
    });
  }, [user]));
  const [form, setForm] = useState<ListingForm>({
    title: '',
    description: '',
    price: '',
    size: '',
    category: '',
    condition: '',
    occasion: '',
    worn_at: '',
  });
  const [measurements, setMeasurements] = useState({ chest: '', waist: '', length: '' });
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<ListingForm & { images: string }>>({});
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const update = (key: keyof ListingForm) => (value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
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
    if (!form.price.trim() || isNaN(Number(form.price))) newErrors.price = 'Enter a valid price';
    if (!form.category) newErrors.category = 'Select a category';
    if (!form.condition) newErrors.condition = 'Select a condition';
    if (images.length === 0) newErrors.images = 'Add at least one photo';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadImages = async (): Promise<string[]> => {
    if (!user) return [];

    const urls: string[] = [];
    for (const uri of images) {
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
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const resetForm = () => {
    setForm({ title: '', description: '', price: '', size: '', category: '', condition: '', occasion: '', worn_at: '' });
    setMeasurements({ chest: '', waist: '', length: '' });
    setImages([]);
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

  const handleSubmit = async () => {
    if (!validate() || !user) return;

    setLoading(true);
    try {
      const imageUrls = await uploadImages();

      const { error } = await supabase.from('listings').insert({
        seller_id: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        category: form.category,
        condition: form.condition,
        size: form.size.trim() || null,
        occasion: form.occasion || null,
        measurements: buildMeasurements(),
        worn_at: form.worn_at.trim() || null,
        images: imageUrls,
        status: 'available',
      });

      if (error) throw error;

      Alert.alert('Listed!', 'Your item is now live.', [
        { text: 'View profile', onPress: () => { resetForm(); router.push('/(tabs)/profile'); } },
        { text: 'List another', onPress: resetForm },
      ]);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create listing.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!validate() || !user) return;

    setLoading(true);
    try {
      const imageUrls = await uploadImages();

      const { error } = await supabase.from('listings').insert({
        seller_id: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        category: form.category,
        condition: form.condition,
        size: form.size.trim() || null,
        occasion: form.occasion || null,
        measurements: buildMeasurements(),
        worn_at: form.worn_at.trim() || null,
        images: imageUrls,
        status: 'draft',
      });

      if (error) throw error;

      Alert.alert('Draft saved', 'Find it in your profile to publish when ready.', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <Header title="New Listing" />
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
        />
        <Input
          label="Description"
          placeholder="Describe your item — size, fabric, fit, any flaws…"
          value={form.description}
          onChangeText={update('description')}
          multiline
          numberOfLines={4}
          style={styles.multiline}
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
          placeholder="0.00"
          value={form.price}
          onChangeText={update('price')}
          keyboardType="decimal-pad"
          error={errors.price}
        />
        <Input
          label="Size"
          placeholder="e.g. S, M, L, XL, 32, 34…"
          value={form.size}
          onChangeText={update('size')}
        />

        <View>
          <Text style={styles.sectionLabel}>Measurements <Text style={styles.optionalLabel}>(optional, in inches)</Text></Text>
          <View style={styles.measureRow}>
            <Input
              label="Chest"
              placeholder="38"
              value={measurements.chest}
              onChangeText={v => setMeasurements(m => ({ ...m, chest: v }))}
              keyboardType="decimal-pad"
              style={styles.measureInput}
            />
            <Input
              label="Waist"
              placeholder="32"
              value={measurements.waist}
              onChangeText={v => setMeasurements(m => ({ ...m, waist: v }))}
              keyboardType="decimal-pad"
              style={styles.measureInput}
            />
            <Input
              label="Length"
              placeholder="44"
              value={measurements.length}
              onChangeText={v => setMeasurements(m => ({ ...m, length: v }))}
              keyboardType="decimal-pad"
              style={styles.measureInput}
            />
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.chipGrid}>
            {SELL_CATEGORIES.map(cat => (
              <Badge
                key={cat}
                label={cat}
                active={form.category === cat}
                onPress={() => {
                  setForm(f => ({ ...f, category: cat }));
                  setErrors(e => ({ ...e, category: undefined }));
                }}
              />
            ))}
          </View>
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}
        </View>

        <View>
          <Text style={styles.sectionLabel}>Condition</Text>
          <View style={styles.chipGrid}>
            {CONDITIONS.map(cond => (
              <Badge
                key={cond}
                label={cond}
                active={form.condition === cond}
                onPress={() => {
                  setForm(f => ({ ...f, condition: cond }));
                  setErrors(e => ({ ...e, condition: undefined }));
                }}
              />
            ))}
          </View>
          {errors.condition ? <Text style={styles.errorText}>{errors.condition}</Text> : null}
        </View>

        <View>
          <Text style={styles.sectionLabel}>Occasion <Text style={styles.optionalLabel}>(optional)</Text></Text>
          <View style={styles.chipGrid}>
            {OCCASIONS.map(occ => (
              <Badge
                key={occ}
                label={occ}
                active={form.occasion === occ}
                onPress={() => setForm(f => ({ ...f, occasion: f.occasion === occ ? '' : occ }))}
              />
            ))}
          </View>
        </View>

        <View style={styles.submitRow}>
          <Button
            label="Save draft"
            variant="outline"
            onPress={handleSaveDraft}
            loading={loading}
            style={styles.draftBtn}
          />
          <Button
            label="List Item"
            onPress={handleSubmit}
            loading={loading}
            style={styles.listBtn}
          />
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
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    optionalLabel: { ...Typography.caption, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
    measureRow: { flexDirection: 'row', gap: Spacing.sm },
    measureInput: { flex: 1 },
    errorText: { ...Typography.caption, color: colors.error, marginTop: Spacing.xs },
    submitRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    draftBtn: { flex: 1 },
    listBtn: { flex: 2 },
  });
}
