import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
  const [declared, setDeclared] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Tax identifier and its type live in user_tax_info (own-row RLS); PII
      // fields live in user_private; the audit timestamp stays on users.
      const [{ data: userRow }, { data: privateRow }, { data: taxInfo }] = await Promise.all([
        supabase
          .from('users')
          .select('tax_id_collected_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('user_private')
          .select('full_name, dob, address_line1, address_line2, city, postcode')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_tax_info')
          .select('tax_id_type, tax_id_number')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      const profile = (userRow || privateRow) ? { ...userRow, ...privateRow } : null;
      if (profile) {
        setLegalName(profile.full_name ?? '');
        setDobDisplay(isoToDisplay(profile.dob ?? null));
        setAddressLine1(profile.address_line1 ?? '');
        setAddressLine2(profile.address_line2 ?? '');
        setCity(profile.city ?? '');
        setPostcode(profile.postcode ?? '');
        const submitted = !!profile.tax_id_collected_at;
        setAlreadySubmitted(submitted);
        if (submitted) setDeclared(true);
      }
      if (taxInfo) {
        if (taxInfo.tax_id_type) setTinType(taxInfo.tax_id_type as TinType);
        if (taxInfo.tax_id_number) setTinNumber(taxInfo.tax_id_number);
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
    postcode.trim().length > 0 &&
    declared;

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    // The actual identifier lives in user_tax_info (own-row RLS); profile
    // fields and the audit timestamps stay on the users row. We write the
    // tax_info first so a transient failure mid-flow can't leave the user
    // row stamped with tax_id_collected_at while the identifier is missing.
    // tax_hold is intentionally not written here — RLS locks it server-side
    // and only admin_update_user_flags can touch it.
    const { error: taxErr } = await supabase
      .from('user_tax_info')
      .upsert({
        user_id: user.id,
        tax_id_type: tinType,
        tax_id_number: tinNumber.trim().toUpperCase(),
        updated_at: new Date().toISOString(),
      });
    if (taxErr) {
      setSaving(false);
      Alert.alert('Something went wrong', 'Please try again.');
      return;
    }
    const [{ error: privateErr }, { error: userErr }] = await Promise.all([
      supabase
        .from('user_private')
        .update({
          full_name: legalName.trim(),
          dob: dobIso,
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim() || null,
          city: city.trim(),
          postcode: postcode.trim().toUpperCase(),
        })
        .eq('user_id', user.id),
      supabase
        .from('users')
        .update({
          tax_id_collected_at: new Date().toISOString(),
          tax_declaration_at: new Date().toISOString(),
        })
        .eq('id', user.id),
    ]);
    const profileErr = privateErr || userErr;
    setSaving(false);
    if (profileErr) {
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
            UK law requires us to collect and report seller details to HMRC once you reach 29 sales
            or £1,690 in a calendar year (UK PIRRR 2023).
          </Text>

          {alreadySubmitted && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={styles.successText}>Details on file. You can update them below.</Text>
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
            reporting threshold.{' '}
            <Text
              style={{ textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('https://www.dukanoh.com/privacy-policy')}
            >
              See our Privacy Policy for details.
            </Text>
          </Text>

          <TouchableOpacity
            style={styles.declarationRow}
            onPress={() => setDeclared(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              { borderColor: declared ? colors.primary : colors.border },
              declared && { backgroundColor: colors.primary },
            ]}>
              {declared && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={[styles.declarationText, { color: colors.textPrimary }]}>
              I confirm that all information provided is accurate and complete to the best of my knowledge. I understand that this information may be reported to HMRC and that providing false or misleading information is a criminal offence.
            </Text>
          </TouchableOpacity>
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
      ...FontFamily.medium,
    },
    sectionLabel: {
      fontSize: 11,
      ...FontFamily.semibold,
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
      ...FontFamily.medium,
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
    declarationRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      flexShrink: 0,
    },
    declarationText: {
      flex: 1,
      fontSize: 13,
      ...FontFamily.regular,
      lineHeight: 19,
    },
  });
}
