import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BorderRadius, FontFamily, Spacing, Typography } from '@/constants/theme';

type TinType = 'NI' | 'UTR';

export default function TaxInfoScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [tinType, setTinType] = useState<TinType>('NI');
  const [tinNumber, setTinNumber] = useState('');
  const [legalName, setLegalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('full_name, tax_id_type, tax_id_number, tax_id_collected_at')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setLegalName(data.full_name ?? '');
        if (data.tax_id_type) setTinType(data.tax_id_type as TinType);
        if (data.tax_id_number) setTinNumber(data.tax_id_number);
        setAlreadySubmitted(!!data.tax_id_collected_at);
      }
      setLoading(false);
    })();
  }, [user]);

  const niPlaceholder = 'e.g. AB 12 34 56 C';
  const utrPlaceholder = 'e.g. 1234567890';

  const isValid = tinNumber.trim().length >= 8;

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
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
    Alert.alert('Details saved', 'Thank you — your tax information has been recorded.', [
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  const styles = useMemo(() => getStyles(colors), [colors]);

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.heading}>Tax information</Text>
        <Text style={styles.subheading}>
          UK law requires us to collect and report seller tax details to HMRC once you reach 30 sales
          or £1,700 in a calendar year. This is a legal requirement under the UK Platform Information
          Reporting Regulations 2023.
        </Text>

        {alreadySubmitted && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
            <Text style={styles.successText}>Details on file — you can update them below.</Text>
          </View>
        )}

        {/* Legal name (read-only) */}
        <Text style={styles.label}>Legal name</Text>
        <View style={[styles.readonlyField, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.readonlyText, { color: colors.textSecondary }]}>
            {legalName || 'Not set — update your profile first'}
          </Text>
        </View>
        <Text style={styles.hint}>To change your legal name, update your profile.</Text>

        {/* TIN type toggle */}
        <Text style={[styles.label, { marginTop: Spacing.lg }]}>Tax identifier type</Text>
        <View style={styles.toggleRow}>
          {(['NI', 'UTR'] as TinType[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[
                styles.toggleOption,
                { borderColor: tinType === t ? colors.primary : colors.border },
                tinType === t && { backgroundColor: colors.primary },
              ]}
              onPress={() => setTinType(t)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.toggleLabel,
                { color: tinType === t ? '#fff' : colors.textSecondary },
              ]}>
                {t === 'NI' ? 'National Insurance number' : 'Unique Taxpayer Reference (UTR)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TIN input */}
        <Text style={[styles.label, { marginTop: Spacing.lg }]}>
          {tinType === 'NI' ? 'National Insurance number' : 'UTR number'}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
          value={tinNumber}
          onChangeText={setTinNumber}
          placeholder={tinType === 'NI' ? niPlaceholder : utrPlaceholder}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType={tinType === 'UTR' ? 'number-pad' : 'default'}
        />
        <Text style={styles.hint}>
          {tinType === 'NI'
            ? 'Your NI number is on your payslips, P60, or HMRC letters. It looks like AB 12 34 56 C.'
            : 'Your UTR is on your Self Assessment returns or HMRC correspondence. It is 10 digits long.'}
        </Text>

        {/* Legal note */}
        <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.legalText, { color: colors.textSecondary }]}>
            This information is stored securely and will only be disclosed to HMRC if you meet the
            reporting threshold. See our Privacy Policy for details.
          </Text>
        </View>

        <Button
          label={saving ? 'Saving…' : alreadySubmitted ? 'Update details' : 'Save details'}
          onPress={handleSave}
          disabled={!isValid || saving}
          style={{ marginTop: Spacing.xl }}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingTop: Spacing.base },
    closeBtn: { alignSelf: 'flex-end', marginBottom: Spacing.base },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.base,
    },
    heading: {
      ...Typography.heading,
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
    },
    subheading: {
      ...Typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.xl,
    },
    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#F0FDF4',
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      marginBottom: Spacing.xl,
    },
    successText: {
      ...Typography.caption,
      color: '#15803D',
      fontFamily: FontFamily.medium,
    },
    label: {
      ...Typography.caption,
      color: colors.textSecondary,
      fontFamily: FontFamily.semibold,
      marginBottom: Spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    readonlyField: {
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
    },
    readonlyText: {
      ...Typography.body,
    },
    hint: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
      lineHeight: 18,
    },
    toggleRow: {
      gap: Spacing.sm,
    },
    toggleOption: {
      borderWidth: 1.5,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: 12,
    },
    toggleLabel: {
      ...Typography.body,
      fontFamily: FontFamily.medium,
    },
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
      ...Typography.body,
    },
    legalBox: {
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      marginTop: Spacing.xl,
    },
    legalText: {
      ...Typography.caption,
      lineHeight: 18,
    },
  });
}
