import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { BorderRadius, ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

interface DukanohFitSheetProps {
  visible: boolean;
  onClose: () => void;
}

const HOW_IT_WORKS = [
  { key: 'Snap',   val: 'Take a photo of any piece you own' },
  { key: 'Detect', val: 'Style and colour identified instantly' },
  { key: 'Match',  val: 'Colour-compatible pieces surfaced' },
];

export function DukanohFitSheet({ visible, onClose }: DukanohFitSheetProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [validating, setValidating] = useState(false);

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Please allow camera access in your settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    // User dismissed camera — stay on sheet
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setValidating(true);

    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!compressed.base64) {
        setValidating(false);
        Alert.alert('Something went wrong', 'Please try again.');
        return;
      }

      const rawBase64 = compressed.base64;
      const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

      const { data } = await supabase.functions.invoke('validate-clothing', {
        body: { imageBase64 },
      });

      setValidating(false);

      if (!data?.isClothing) {
        Alert.alert(
          'Not a clothing item',
          'Please take a photo of the clothing piece you want to match.',
          [{ text: 'Try again' }]
        );
        return;
      }

      // Validated — close sheet and navigate to the form
      onClose();
      router.push({
        pathname: '/dukanoh-fit',
        params: {
          photoUri: compressed.uri,
          detectedCategory: data.detectedCategory ?? '',
          detectedColour: data.detectedColour ?? '',
        },
      });
    } catch {
      setValidating(false);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }, [onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose} useModal>
      <Text style={styles.title}>Dukanoh Fit</Text>
      <Text style={styles.subtitle}>
        Snap a piece you own — we'll find what goes with it.
      </Text>

      <View style={styles.hairline} />

      {HOW_IT_WORKS.map(({ key, val }) => (
        <View key={key} style={styles.detailRow}>
          <Text style={styles.detailKey}>{key}</Text>
          <Text style={styles.detailVal}>{val}</Text>
        </View>
      ))}

      <View style={styles.statCard}>
        <Text style={styles.statLabel}>
          Only colour-compatible pieces are shown — no clashing combinations
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={validating ? 'Checking image...' : 'Take a photo'}
          variant="primary"
          onPress={handleTakePhoto}
          loading={validating}
          disabled={validating}
          icon={!validating ? <Ionicons name="camera-outline" size={18} color="#fff" /> : undefined}
          style={{ alignSelf: 'stretch' }}
        />
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.maybeLater}>
          <Text style={styles.maybeLaterText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    title: {
      ...Typography.heading,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    subtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: Spacing.base,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.base,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailKey: {
      ...Typography.body,
      color: colors.textSecondary,
    },
    detailVal: {
      ...Typography.body,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'right',
      marginLeft: Spacing.base,
    },
    statCard: {
      backgroundColor: colors.surface,
      borderRadius: BorderRadius.medium,
      padding: Spacing.base,
      alignItems: 'center',
      marginTop: Spacing.base,
    },
    statLabel: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    actions: {
      marginTop: Spacing.base,
      gap: Spacing.sm,
    },
    maybeLater: {
      paddingTop: Spacing.base,
    },
    maybeLaterText: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
