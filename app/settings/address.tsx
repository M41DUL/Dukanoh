import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Spacing, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface AddressForm {
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  country: string;
}

export default function DeliveryAddressScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [form, setForm] = useState<AddressForm>({
    address_line1: '',
    address_line2: '',
    city: '',
    postcode: '',
    country: 'United Kingdom',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<AddressForm>>({});

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from('users')
          .select('address_line1, address_line2, city, postcode, country')
          .eq('id', user.id)
          .single();
        if (data) {
          setForm({
            address_line1: data.address_line1 ?? '',
            address_line2: data.address_line2 ?? '',
            city: data.city ?? '',
            postcode: data.postcode ?? '',
            country: data.country ?? 'United Kingdom',
          });
        }
        setLoading(false);
      })();
    }, [user])
  );

  const validate = (): boolean => {
    const newErrors: Partial<AddressForm> = {};
    if (!form.address_line1.trim()) newErrors.address_line1 = 'Required';
    if (!form.city.trim()) newErrors.city = 'Required';
    if (!form.postcode.trim()) newErrors.postcode = 'Required';
    if (!form.country.trim()) newErrors.country = 'Required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim(),
        postcode: form.postcode.trim().toUpperCase(),
        country: form.country.trim(),
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save address. Please try again.');
    } else {
      router.back();
    }
  };

  const field = (key: keyof AddressForm) => ({
    value: form[key],
    onChangeText: (text: string) => {
      setForm(prev => ({ ...prev, [key]: text }));
      if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
    },
    error: errors[key],
  });

  return (
    <ScreenWrapper>
      <Header title="Delivery address" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.hint}>
              Saved here and pre-filled at checkout. You can edit it per order.
            </Text>

            <View style={styles.form}>
              <Input
                label="Address line 1"
                placeholder="House number and street"
                autoCapitalize="words"
                returnKeyType="next"
                {...field('address_line1')}
              />
              <Input
                label="Address line 2 (optional)"
                placeholder="Flat, building, etc."
                autoCapitalize="words"
                returnKeyType="next"
                {...field('address_line2')}
              />
              <Input
                label="City"
                placeholder="London"
                autoCapitalize="words"
                returnKeyType="next"
                {...field('city')}
              />
              <Input
                label="Postcode"
                placeholder="SW1A 1AA"
                autoCapitalize="characters"
                returnKeyType="next"
                {...field('postcode')}
              />
              <Input
                label="Country"
                placeholder="United Kingdom"
                autoCapitalize="words"
                returnKeyType="done"
                {...field('country')}
              />
            </View>

            <Button
              label="Save address"
              onPress={handleSave}
              loading={saving}
              style={styles.saveButton}
            />
          </ScrollView>
        )}
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
    hint: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      color: colors.textSecondary,
      lineHeight: 18,
    },
    form: {
      gap: Spacing.base,
    },
    saveButton: {
      marginTop: Spacing.sm,
    },
  });
}
