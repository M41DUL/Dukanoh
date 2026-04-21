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

export default function TaxInfoScreen() {
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
          {/* Explanation */}
          <Text style={styles.body}>
            UK law requires us to collect and report seller tax details to HMRC once you reach
            30 sales or £1,700 in a calendar year. This is a legal requirement under the UK
            Platform Information Reporting Regulations 2023.
          </Text>

          {alreadySubmitted && (
            <View style={[styles.successBanner, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={styles.successText}>Details on file — you can update them below.</Text>
            </View>
          )}

          {/* Legal name (read-only) */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={styles.fieldLabel}>Legal name</Text>
            <Text style={[styles.fieldValue, { color: legalName ? colors.textPrimary : colors.textSecondary }]}>
              {legalName || 'Not set — update your profile first'}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              To change your legal name, update your profile.
            </Text>
          </View>

          {/* TIN type toggle */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Tax identifier type</Text>
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
          </View>

          {/* TIN number input */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {tinType === 'NI' ? 'National Insurance number' : 'UTR number'}
          </Text>
          <TextInput
            style={[styles.input, {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
            }]}
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
              ? 'Your NI number is on your payslips, P60, or HMRC letters. It looks like AB 12 34 56 C.'
              : 'Your UTR is on your Self Assessment returns or HMRC correspondence. It is 10 digits long.'}
          </Text>

          {/* Legal note */}
          <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              This information is stored securely and will only be disclosed to HMRC if you meet
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
    fieldValue: {
      ...Typography.body,
      paddingBottom: Spacing.xs,
    },
    hint: {
      ...Typography.caption,
      lineHeight: 18,
      paddingVertical: Spacing.sm,
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
    input: {
      borderWidth: 1,
      borderRadius: BorderRadius.large,
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: FontFamily.regular,
    },
    legalBox: {
      borderWidth: 1,
      borderRadius: BorderRadius.large,
      paddingHorizontal: Spacing.base,
    },
  });
}
