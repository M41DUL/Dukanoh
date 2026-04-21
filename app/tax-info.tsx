import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';

type TinType = 'NI' | 'UTR';

function isoToDisplay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string): string | null {
  const parts = display.replace(/\s/g, '').split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  const date = new Date(`${y}-${m}-${d}`);
  if (isNaN(date.getTime())) return null;
  return `${y}-${m}-${d}`;
}

function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function TaxInfoScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [legalName, setLegalName] = useState('');
  const [dobDisplay, setDobDisplay] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [tinType, setTinType] = useState<TinType>('NI');
  const [tinNumber, setTinNumber] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('full_name, dob, address_line1, address_line2, city, postcode, tax_id_type, tax_id_number, tax_id_collected_at')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setLegalName(data.full_name ?? '');
        setDobDisplay(isoToDisplay(data.dob));
        setAddressLine1(data.address_line1 ?? '');
        setAddressLine2(data.address_line2 ?? '');
        setCity(data.city ?? '');
        setPostcode(data.postcode ?? '');
        if (data.tax_id_type) setTinType(data.tax_id_type as TinType);
        if (data.tax_id_number) setTinNumber(data.tax_id_number);
        setAlreadySubmitted(!!data.tax_id_collected_at);
      }
      setLoading(false);
    })();
  }, [user]);

  const dobIso = displayToIso(dobDisplay);
  const isValid =
    legalName.trim().length > 0 &&
    tinNumber.trim().length >= 8 &&
    !!dobIso &&
    addressLine1.trim().length > 0 &&
    city.trim().length > 0 &&
    postcode.trim().length > 0;

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        full_name: legalName.trim(),
        dob: dobIso,
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || null,
        city: city.trim(),
        postcode: postcode.trim().toUpperCase(),
        tax_id_type: tinType,
        tax_id_number: tinNumber.trim().toUpperCase(),
        tax_id_collected_at: new Date().toISOString(),
        tax_hold: false,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Something went wrong', 'Please try again.');
      return;
    }
    setAlreadySubmitted(true);
    Alert.alert('Details saved', 'Your tax information has been recorded.', [
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  const closeButton = (
    <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ paddingRight: Spacing.base }}>
      <Ionicons name="close" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const topPad = insets.top + Spacing.sm;
  const bottomPad = insets.bottom + Spacing.base;

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.handle} />
        <Header title="Tax information" rightAction={closeButton} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.handle} />
      <Header title="Tax information" rightAction={closeButton} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={topPad + 56}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.body}>
            UK law requires us to collect and report seller details to HMRC once you reach 30 sales
            or £1,700 in a calendar year (UK PIRRR 2023).
          </Text>

          {alreadySubmitted && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={styles.successText}>Details on file — you can update them below.</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Personal details</Text>

          <Input
            label="Legal name"
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Your full legal name"
            autoCapitalize="words"
            autoCorrect={false}
            hint="Enter your name exactly as it appears on official documents."
          />

          <Input
            label="Date of birth"
            value={dobDisplay}
            onChangeText={v => setDobDisplay(formatDobInput(v))}
            placeholder="DD/MM/YYYY"
            keyboardType="number-pad"
            maxLength={10}
          />

          <Input
            label="Address line 1"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="e.g. 12 Chapel Street"
            autoCapitalize="words"
          />

          <Input
            label="Address line 2 (optional)"
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Flat, building, estate…"
            autoCapitalize="words"
          />

          <View style={styles.rowInputs}>
            <View style={styles.flex}>
              <Input
                label="Town / city"
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Manchester"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.postcodeWrap}>
              <Input
                label="Postcode"
                value={postcode}
                onChangeText={v => setPostcode(v.toUpperCase())}
                placeholder="SK14 1JB"
                autoCapitalize="characters"
              />
            </View>
          </View>

          <Divider />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tax identifier</Text>

          {(['NI', 'UTR'] as TinType[]).map((t, i) => (
            <View key={t}>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setTinType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                  {t === 'NI' ? 'National Insurance number' : 'Unique Taxpayer Reference (UTR)'}
                </Text>
                <View style={[
                  styles.radio,
                  { borderColor: tinType === t ? colors.primary : colors.border },
                  tinType === t && { backgroundColor: colors.primary },
                ]}>
                  {tinType === t && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
              {i === 0 && <Divider />}
            </View>
          ))}

          <Input
            label={tinType === 'NI' ? 'NI number' : 'UTR number'}
            value={tinNumber}
            onChangeText={setTinNumber}
            placeholder={tinType === 'NI' ? 'e.g. AB 12 34 56 C' : 'e.g. 1234567890'}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType={tinType === 'UTR' ? 'number-pad' : 'default'}
            hint={tinType === 'NI'
              ? 'Found on your payslips, P60, or HMRC letters.'
              : 'Found on your Self Assessment returns or HMRC correspondence. 10 digits.'}
          />

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            This information is stored securely and will only be shared with HMRC if you reach the
            reporting threshold. See our Privacy Policy for details.
          </Text>
        </ScrollView>

        {/* Sticky CTA */}
        <View style={[styles.footer, { paddingBottom: bottomPad, borderTopColor: colors.border }]}>
          <Button
            label={saving ? 'Saving…' : alreadySubmitted ? 'Update details' : 'Save details'}
            onPress={handleSave}
            disabled={!isValid || saving}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    safe: { flex: 1 },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Spacing.sm,
    },
    flex: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.xl,
      gap: Spacing.lg,
    },
    footer: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.base,
      borderTopWidth: 1,
    },
    body: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: '#F0FDF4',
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
    },
    successText: {
      ...Typography.caption,
      color: '#15803D',
      fontFamily: FontFamily.medium,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    hint: {
      ...Typography.caption,
      lineHeight: 18,
    },
    rowInputs: {
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'flex-start',
    },
    postcodeWrap: {
      width: 120,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    optionLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: FontFamily.medium,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#fff',
    },
  });
}
