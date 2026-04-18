import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, ActionSheetIOS } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LocationPicker } from '@/components/LocationPicker';
import { Spacing, ColorTokens, proColorsDark, proColorsLight } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function EditProfileScreen() {
  const { user, refreshProfile, sellerTier } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('full_name, first_name, last_name, bio, avatar_url, location, phone, dob')
          .eq('id', user.id)
          .maybeSingle();
        if (data) {
          // Prefer split fields; fall back to splitting full_name for existing accounts
          if (data.first_name || data.last_name) {
            setFirstName(data.first_name ?? '');
            setLastName(data.last_name ?? '');
          } else if (data.full_name && data.full_name !== 'New User') {
            const parts = data.full_name.split(' ');
            setFirstName(parts[0] ?? '');
            setLastName(parts.slice(1).join(' '));
          }
          setBio(data.bio ?? '');
          setLocation(data.location ?? '');
          setPhone(data.phone ?? '');
          if (data.dob) {
            // DB stores YYYY-MM-DD, display as DD/MM/YYYY
            const [y, m, d] = data.dob.split('-');
            setDob(`${d}/${m}/${y}`);
          }
          setAvatarUrl(data.avatar_url ?? undefined);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const uploadAvatar = useCallback(async (uri: string) => {
    if (!user) return;
    const path = `${user.id}.jpg`;

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: path,
      type: 'image/jpeg',
    } as any);

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, formData, { contentType: 'multipart/form-data', upsert: true });

    if (error) {
      Alert.alert('Upload failed', error.message);
      return;
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`;
    await supabase.from('users').update({ avatar_url: newUrl }).eq('id', user.id);
    setAvatarUrl(newUrl);
  }, [user]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  }, [uploadAvatar]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  }, [uploadAvatar]);

  const handleChangePhoto = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) takePhoto();
          if (index === 2) pickFromLibrary();
        },
      );
    } else {
      Alert.alert('Change Photo', undefined, [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ], { cancelable: true });
    }
  }, [takePhoto, pickFromLibrary]);

  const handleDobChange = useCallback((text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setDob(formatted);
  }, []);

  // Parse DD/MM/YYYY → YYYY-MM-DD for DB, returns null if invalid/empty
  const parseDob = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, d, m, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };

  const handleSave = useCallback(async () => {
    if (!user) return;

    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();

    const dobForDb = dob.trim() ? parseDob(dob) : null;
    if (dob.trim() && !dobForDb) {
      Alert.alert('Invalid date', 'Please enter your date of birth as DD/MM/YYYY.');
      return;
    }

    setSaving(true);
    const fullName = [trimFirst, trimLast].filter(Boolean).join(' ') || 'New User';

    const { error } = await supabase
      .from('users')
      .update({
        first_name: trimFirst || null,
        last_name: trimLast || null,
        full_name: fullName,
        bio: bio.trim() || null,
        location: location.trim() || null,
        phone: phone.trim() || null,
        dob: dobForDb,
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save changes.');
      return;
    }
    await refreshProfile();
    router.back();
  }, [user, firstName, lastName, bio, location, phone, dob, refreshProfile]);

  if (loading) return <ScreenWrapper><View /></ScreenWrapper>;

  return (
    <ScreenWrapper>
      <Header title="Edit Profile" showBack />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['2xl'] }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.avatarSection} onPress={handleChangePhoto} activeOpacity={0.7}>
          <Avatar uri={avatarUrl} initials={firstName[0]?.toUpperCase()} size="xlarge" />
          <Text style={styles.changePhoto}>Change photo</Text>
        </TouchableOpacity>

        {/* Founder / Pro tier pill */}
        {(sellerTier === 'founder' || sellerTier === 'pro') && (
          <View style={[styles.tierPill, { backgroundColor: proColorsDark.proAccent + '22', borderColor: proColorsDark.proAccent + '60' }]}>
            <Ionicons name="checkmark-circle" size={14} color={proColorsLight.proAccentText} />
            <Text style={[styles.tierPillText, { color: proColorsLight.proAccentText }]}>
              {sellerTier === 'founder' ? 'Founder' : 'Dukanoh Pro'}
            </Text>
          </View>
        )}

        <Input
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          maxLength={50}
          autoCapitalize="words"
        />

        <Input
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          maxLength={50}
          autoCapitalize="words"
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
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+44 7700 900000"
          keyboardType="phone-pad"
          maxLength={20}
        />

        <Input
          label="Date of birth"
          value={dob}
          onChangeText={handleDobChange}
          placeholder="DD/MM/YYYY"
          keyboardType="number-pad"
          maxLength={10}
          hint="Used to verify your identity when you sell"
        />

        <View>
          <Input
            label="Location"
            value={location}
            placeholder="Select your location"
            editable={false}
            rightIcon={<Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
          />
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setLocationPickerVisible(true)}
            activeOpacity={0.7}
          />
        </View>

        <Button
          label={saving ? 'Saving...' : 'Save'}
          variant="outline"
          onPress={handleSave}
          disabled={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
      </KeyboardAvoidingView>

      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelect={(loc) => setLocation(loc)}
      />
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
      color: colors.primaryText,
      fontFamily: 'Inter_600SemiBold',
    },
    tierPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
      alignSelf: 'center',
    },
    tierPillText: {
      fontSize: 13,
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
