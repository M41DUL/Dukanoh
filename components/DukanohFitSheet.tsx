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
import { ColorTokens, FontFamily, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/lib/supabase';

interface DukanohFitSheetProps {
  visible: boolean;
  onClose: () => void;
}

const HOW_IT_WORKS = [
  { icon: 'camera-outline',   key: 'Your piece',   val: 'Take a photo of anything in your wardrobe' },
  { icon: 'color-palette-outline', key: 'The style',    val: 'We read the colour and cut automatically' },
  { icon: 'bag-handle-outline',    key: 'Your matches', val: 'Pieces that go with it, ready to shop' },
] as const;

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
        Have a piece but nothing to wear it with? Snap it and we'll find everything that goes with it.
      </Text>

      {HOW_IT_WORKS.map(({ icon, key, val }) => (
        <View key={key} style={styles.detailRow}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={20} color={colors.primary} />
          </View>
          <View style={styles.detailText}>
            <Text style={styles.detailKey}>{key}</Text>
            <Text style={styles.detailVal}>{val}</Text>
          </View>
        </View>
      ))}

      <View style={styles.actions}>
        <Button
          label={validating ? 'Checking image...' : 'Take a photo'}
          variant="primary"
          onPress={handleTakePhoto}
          loading={validating}
          disabled={validating}
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
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      paddingVertical: Spacing.sm,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailText: {
      flex: 1,
      gap: 2,
    },
    detailKey: {
      ...Typography.label,
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    detailVal: {
      ...Typography.body,
      color: colors.textSecondary,
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
