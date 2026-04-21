import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';

type TinType = 'NI' | 'UTR';

// Convert stored YYYY-MM-DD to display DD/MM/YYYY
function isoToDisplay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Convert display DD/MM/YYYY to stored YYYY-MM-DD
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
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Identity fields
  const [legalName, setLegalName] = useState('');
  const [dobDisplay, setDobDisplay] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');

  // TIN fields
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
    tinNumber.trim().length >= 8 &&
    !!dobIso &&
    addressLine1.trim().length > 0 &&
    city.trim().length > 0 &&
    postcode.trim().length > 0;

  const missingFields = [
    !dobIso && 'Date of birth',
    !addressLine1.trim() && 'Address line 1',
    !city.trim() && 'Town / city',
    !postcode.trim() && 'Postcode',
    tinNumber.trim().length < 8 && (tinType === 'NI' ? 'NI number' : 'UTR number'),
  ].filter(Boolean) as string[];

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
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

  if (loading) {
    return (
      <ScreenWrapper>
        <Header title="Tax information" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Tax information" showBack />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
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
            <View style={[styles.successBanner, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={styles.successText}>Details on file — you can update them below.</Text>
            </View>
          )}

          {/* ── Personal details ── */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Personal details</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>

            {/* Legal name — read-only */}
            <Text style={styles.fieldLabel}>Legal name</Text>
            <Text style={[styles.readonlyValue, { color: legalName ? colors.textPrimary : colors.textSecondary }]}>
              {legalName || 'Not set — update your profile first'}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              To change your legal name, update your profile.
            </Text>

            <Divider />

            {/* Date of birth */}
            <Text style={styles.fieldLabel}>Date of birth</Text>
            <TextInput
              style={[styles.inlineInput, { color: colors.textPrimary }]}
              value={dobDisplay}
              onChangeText={v => setDobDisplay(formatDobInput(v))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
            />

            <Divider />

            {/* Address */}
            <Text style={styles.fieldLabel}>Home address</Text>
            <TextInput
              style={[styles.inlineInput, { color: colors.textPrimary }]}
              value={addressLine1}
              onChangeText={setAddressLine1}
              placeholder="Address line 1"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.inlineInput, styles.inlineInputGap, { color: colors.textPrimary }]}
              value={addressLine2}
              onChangeText={setAddressLine2}
              placeholder="Address line 2 (optional)"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
            />
            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.inlineInput, styles.inlineInputGap, styles.flex, { color: colors.textPrimary }]}
                value={city}
                onChangeText={setCity}
                placeholder="Town / city"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.inlineInput, styles.inlineInputGap, styles.postcodeInput, { color: colors.textPrimary }]}
                value={postcode}
                onChangeText={v => setPostcode(v.toUpperCase())}
                placeholder="Postcode"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* ── Tax identifier ── */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tax identifier</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
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

            <Divider />

            <Text style={styles.fieldLabel}>
              {tinType === 'NI' ? 'NI number' : 'UTR number'}
            </Text>
            <TextInput
              style={[styles.inlineInput, { color: colors.textPrimary }]}
              value={tinNumber}
              onChangeText={setTinNumber}
              placeholder={tinType === 'NI' ? 'e.g. AB 12 34 56 C' : 'e.g. 1234567890'}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType={tinType === 'UTR' ? 'number-pad' : 'default'}
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {tinType === 'NI'
                ? 'Found on your payslips, P60, or HMRC letters.'
                : 'Found on your Self Assessment returns or HMRC correspondence. 10 digits.'}
            </Text>
          </View>

          {/* Missing fields hint */}
          {missingFields.length > 0 && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Still needed: {missingFields.join(', ')}
            </Text>
          )}

          {/* Legal note */}
          <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              This information is stored securely and will only be shared with HMRC if you reach
              the reporting threshold. See our Privacy Policy for details.
            </Text>
          </View>

          <Button
            label={saving ? 'Saving…' : alreadySubmitted ? 'Update details' : 'Save details'}
            onPress={handleSave}
            disabled={!isValid || saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: {
      paddingTop: Spacing.lg,
      paddingBottom: Spacing['3xl'],
      gap: Spacing.lg,
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
      marginBottom: -Spacing.sm,
    },
    card: {
      borderRadius: BorderRadius.large,
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.sm,
    },
    fieldLabel: {
      fontSize: 11,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Spacing.base,
      marginBottom: Spacing.xs,
    },
    readonlyValue: {
      ...Typography.body,
      paddingBottom: Spacing.xs,
    },
    hint: {
      ...Typography.caption,
      lineHeight: 18,
      paddingVertical: Spacing.sm,
    },
    inlineInput: {
      fontSize: 15,
      fontFamily: FontFamily.regular,
      paddingVertical: Spacing.sm,
    },
    inlineInputGap: {
      marginTop: Spacing.xs,
    },
    rowInputs: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    postcodeInput: {
      width: 110,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.base,
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
    legalBox: {
      borderWidth: 1,
      borderRadius: BorderRadius.large,
      paddingHorizontal: Spacing.base,
    },
  });
}
