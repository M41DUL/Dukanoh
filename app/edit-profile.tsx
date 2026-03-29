import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function EditProfileScreen() {
  const { user, refreshProfile } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('full_name, username, bio, avatar_url, location')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.full_name === 'New User' ? '' : (data.full_name ?? ''));
          setBio(data.bio ?? '');
          setLocation(data.location ?? '');
          setAvatarUrl(data.avatar_url ?? undefined);
        }
        setLoading(false);
      });
  }, [user]);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0] || !user) return;

    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

    if (error) {
      Alert.alert('Upload failed', error.message);
      return;
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`;
    await supabase.from('users').update({ avatar_url: newUrl }).eq('id', user.id);
    setAvatarUrl(newUrl);
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const trimmedName = name.trim();
    const trimmedBio = bio.trim();
    const trimmedLocation = location.trim();

    const { error } = await supabase
      .from('users')
      .update({
        full_name: trimmedName || 'New User',
        bio: trimmedBio || null,
        location: trimmedLocation || null,
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save changes.');
      return;
    }
    await refreshProfile();
    router.back();
  }, [user, name, bio, location, refreshProfile]);

  if (loading) return <ScreenWrapper><View /></ScreenWrapper>;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.avatarSection} onPress={pickImage} activeOpacity={0.7}>
          <Avatar uri={avatarUrl} initials={name[0]?.toUpperCase()} size="xlarge" />
          <Text style={styles.changePhoto}>Change photo</Text>
        </TouchableOpacity>

        <Input
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          maxLength={50}
        />

        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people about yourself"
          multiline
          maxLength={200}
          style={styles.bioInput}
        />

        <Input
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. London, UK"
          maxLength={50}
        />

        <Button
          label={saving ? 'Saving...' : 'Save'}
          variant="outline"
          onPress={handleSave}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    backBtn: { padding: Spacing.xs, width: 40 },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    content: {
      paddingTop: Spacing.xl,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
    },
    avatarSection: {
      alignItems: 'center',
      marginBottom: Spacing.md,
      gap: Spacing.sm,
    },
    changePhoto: {
      fontSize: 14,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    bioInput: {
      minHeight: 120,
      textAlignVertical: 'top',
    },
    flex: { flex: 1 },
    saveBtn: {
      marginTop: Spacing.md,
    },
  });
}
