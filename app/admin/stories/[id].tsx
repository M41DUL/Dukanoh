import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Spacing, BorderRadius, ColorTokens, FontFamily, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';
import type { AppStoryDestination } from '@/hooks/useStories';

type ExpiryChoice = '1d' | '7d' | '30d' | 'never' | 'custom';

const DESTINATIONS: { value: AppStoryDestination; label: string }[] = [
  { value: 'home',            label: 'Home feed' },
  { value: 'listings',        label: 'Browse listings' },
  { value: 'search',          label: 'Search' },
  { value: 'sell',            label: 'Sell' },
  { value: 'saved',           label: 'Saved' },
  { value: 'dukanoh-fit',     label: 'Dukanoh Fit' },
  { value: 'boosts',          label: 'Boosts' },
  { value: 'specific-listing', label: 'Specific listing' },
];

function expiryChoiceToDate(choice: ExpiryChoice, custom: string | null): string | null {
  if (choice === 'never') return null;
  if (choice === 'custom') return custom;
  const daysMap: Record<Exclude<ExpiryChoice, 'never' | 'custom'>, number> = { '1d': 1, '7d': 7, '30d': 30 };
  return new Date(Date.now() + daysMap[choice] * 24 * 60 * 60 * 1000).toISOString();
}

export default function AdminStoryComposerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pendingLocalUri, setPendingLocalUri] = useState<string | null>(null);

  // Toggles
  const [hasHeadline, setHasHeadline] = useState(false);
  const [hasBody, setHasBody] = useState(false);
  const [hasCta, setHasCta] = useState(false);

  // Fields
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaDestination, setCtaDestination] = useState<AppStoryDestination>('home');
  const [ctaListingId, setCtaListingId] = useState('');

  // Expiry
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('7d');

  // Load existing story when editing
  useEffect(() => {
    if (isNew || !id) return;
    (async () => {
      const { data, error } = await supabase
        .from('app_stories')
        .select('image_url, headline, body, cta_label, cta_destination, cta_listing_id, expires_at')
        .eq('id', id)
        .single();
      if (error || !data) {
        Alert.alert('Could not load story', error?.message ?? 'Not found');
        router.back();
        return;
      }
      setImageUrl(data.image_url);
      setHeadline(data.headline ?? '');
      setHasHeadline(!!data.headline);
      setBody(data.body ?? '');
      setHasBody(!!data.body);
      setCtaLabel(data.cta_label ?? '');
      setHasCta(!!data.cta_label);
      if (data.cta_destination) setCtaDestination(data.cta_destination as AppStoryDestination);
      setCtaListingId(data.cta_listing_id ?? '');
      // Map persisted expires_at to a chip; "custom" preserves the existing
      // value if it doesn't match a stock choice. Never -> null.
      setExpiryChoice(data.expires_at ? 'custom' : 'never');
      setLoading(false);
    })();
  }, [id, isNew]);

  const pickImage = useCallback(async () => {
    // Skip the native cropper: on iOS allowsEditing forces a 1:1 square
    // and ignores `aspect`. Story images are displayed contentFit="cover"
    // so the full image goes up and is cropped at render time instead.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingLocalUri(result.assets[0].uri);
    }
  }, []);

  const uploadIfNeeded = async (): Promise<string | null> => {
    if (!pendingLocalUri || !user) return imageUrl;
    const compressed = await compressImage(pendingLocalUri);
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const response = await fetch(compressed);
    const arrayBuffer = await response.arrayBuffer();
    const { error } = await supabase.storage
      .from('app-stories')
      .upload(path, arrayBuffer, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    const { data } = supabase.storage.from('app-stories').getPublicUrl(path);
    return data.publicUrl;
  };

  const onSave = async () => {
    // A story needs at least one piece of content. Image-only is fine,
    // text-only is fine (uses the default banner background); empty is not.
    const willHaveImage = !!pendingLocalUri || !!imageUrl;
    const willHaveCopy =
      (hasHeadline && headline.trim()) ||
      (hasBody && body.trim()) ||
      (hasCta && ctaLabel.trim());
    if (!willHaveImage && !willHaveCopy) {
      Alert.alert('Empty story', 'Add an image or some text before saving.');
      return;
    }
    if (hasCta) {
      if (!ctaLabel.trim()) {
        Alert.alert('CTA label required', 'Add a label for the button or turn the CTA off.');
        return;
      }
      if (ctaDestination === 'specific-listing' && !ctaListingId.trim()) {
        Alert.alert('Listing required', 'Paste a listing ID or pick a different destination.');
        return;
      }
    }

    setSaving(true);
    try {
      const finalImageUrl = await uploadIfNeeded();
      const expires_at = expiryChoiceToDate(expiryChoice, null);

      const { error } = await supabase.rpc('admin_save_app_story', {
        payload: {
          id: isNew ? null : id ?? null,
          image_url: finalImageUrl ?? '',
          headline: hasHeadline && headline.trim() ? headline.trim() : null,
          body: hasBody && body.trim() ? body.trim() : null,
          cta_label: hasCta && ctaLabel.trim() ? ctaLabel.trim() : null,
          cta_destination: hasCta ? ctaDestination : null,
          cta_listing_id: hasCta && ctaDestination === 'specific-listing' ? ctaListingId.trim() : null,
          expires_at: expires_at,
        },
      });

      if (error) {
        Alert.alert('Could not save', error.message);
        setSaving(false);
        return;
      }
      router.back();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unexpected error';
      Alert.alert('Could not save', message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title={isNew ? 'New story' : 'Edit story'} showBack />
        <LoadingSpinner />
      </ScreenWrapper>
    );
  }

  const previewUri = pendingLocalUri ?? imageUrl;

  return (
    <ScreenWrapper>
      <Header title={isNew ? 'New story' : 'Edit story'} showBack />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Image */}
          <Text style={styles.sectionLabel}>Image</Text>
          <TouchableOpacity onPress={pickImage} style={[styles.imageBox, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.imagePreview} contentFit="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.imagePlaceholderText, { color: colors.textSecondary }]}>Tap to choose an image</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Headline */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Headline</Text>
              <Switch
                value={hasHeadline}
                onValueChange={setHasHeadline}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {hasHeadline && (
              <>
                <Divider style={styles.divider} />
                <Input
                  value={headline}
                  onChangeText={setHeadline}
                  placeholder="Welcome to Dukanoh"
                  maxLength={60}
                  containerStyle={styles.fieldInner}
                />
              </>
            )}
          </View>

          {/* Body */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Body</Text>
              <Switch
                value={hasBody}
                onValueChange={setHasBody}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {hasBody && (
              <>
                <Divider style={styles.divider} />
                <Input
                  value={body}
                  onChangeText={setBody}
                  placeholder="The South Asian fashion marketplace…"
                  maxLength={140}
                  multiline
                  numberOfLines={3}
                  containerStyle={styles.fieldInner}
                />
              </>
            )}
          </View>

          {/* CTA */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>CTA button</Text>
              <Switch
                value={hasCta}
                onValueChange={setHasCta}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {hasCta && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.fieldInner}>
                  <Input
                    label="Button label"
                    value={ctaLabel}
                    onChangeText={setCtaLabel}
                    placeholder="Browse listings"
                    maxLength={28}
                  />
                  <Text style={styles.fieldLabel}>Destination</Text>
                  <View style={styles.destinationRow}>
                    {DESTINATIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setCtaDestination(opt.value)}
                        style={[
                          styles.destChip,
                          { borderColor: colors.border },
                          ctaDestination === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.destChipText,
                          { color: colors.textPrimary },
                          ctaDestination === opt.value && { color: '#FFFFFF' },
                        ]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {ctaDestination === 'specific-listing' && (
                    <Input
                      label="Listing ID"
                      value={ctaListingId}
                      onChangeText={setCtaListingId}
                      placeholder="Paste listing UUID"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}
                </View>
              </>
            )}
          </View>

          {/* Expiry */}
          <Text style={styles.sectionLabel}>Expires</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, padding: Spacing.base }]}>
            <View style={styles.expiryRow}>
              {(['1d', '7d', '30d', 'never'] as const).map(choice => (
                <TouchableOpacity
                  key={choice}
                  onPress={() => setExpiryChoice(choice)}
                  style={[
                    styles.expiryChip,
                    { borderColor: colors.border },
                    expiryChoice === choice && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.expiryChipText,
                    { color: colors.textPrimary },
                    expiryChoice === choice && { color: '#FFFFFF' },
                  ]}>
                    {choice === '1d' ? '1 day' : choice === '7d' ? '7 days' : choice === '30d' ? '30 days' : 'Never'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Button
            label={saving ? 'Saving…' : isNew ? 'Publish' : 'Save'}
            onPress={onSave}
            disabled={saving}
            style={styles.saveBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    content: {
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: -Spacing.sm,
    },
    imageBox: {
      aspectRatio: 9 / 16,
      borderRadius: BorderRadius.large,
      overflow: 'hidden',
      borderWidth: 1,
      maxHeight: 360,
    },
    imagePreview: {
      width: '100%',
      height: '100%',
    },
    imagePlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
    },
    imagePlaceholderText: {
      ...Typography.body,
      fontSize: 13,
    },
    card: {
      borderRadius: BorderRadius.large,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.base,
    },
    toggleLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    divider: { marginVertical: 0 },
    fieldInner: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.base,
    },
    fieldLabel: {
      fontSize: 12,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    destinationRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    destChip: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.medium,
      borderWidth: 1,
    },
    destChipText: {
      fontSize: 13,
      fontFamily: FontFamily.medium,
    },
    expiryRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    expiryChip: {
      flex: 1,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.medium,
      borderWidth: 1,
      alignItems: 'center',
    },
    expiryChipText: {
      fontSize: 13,
      fontFamily: FontFamily.medium,
    },
    saveBtn: {
      marginTop: Spacing.sm,
    },
  });
}
