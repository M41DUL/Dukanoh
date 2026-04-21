import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = (userId: string) => `@dukanoh/consent_shown_${userId}`;

interface Props {
  userId: string;
}

export function ConsentModal({ userId }: Props) {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY(userId)).then(val => {
      if (!val) setVisible(true);
    });
  }, [userId]);

  const handleChoice = async (accept: boolean) => {
    await supabase
      .from('users')
      .update({ analytics_consent: accept })
      .eq('id', userId);
    await AsyncStorage.setItem(STORAGE_KEY(userId), 'true');
    setVisible(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={styles.title}>Help us improve Dukanoh</Text>
          <Text style={styles.body}>
            We'd like to collect anonymous usage data (crashes, feature usage) to improve the app.
            We never sell your data or use it for advertising.
          </Text>
          <Text style={styles.body}>
            You can change this at any time in{' '}
            <Text style={styles.bold}>Settings → Privacy</Text>.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => handleChoice(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Accept analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => handleChoice(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL('https://www.dukanoh.com/privacy-policy')}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={styles.link}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 12,
    ...Platform.select({
      android: { elevation: 24 },
    }),
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#0D0D0D',
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#6B6B6B',
    lineHeight: 21,
  },
  bold: {
    fontFamily: 'Inter_600SemiBold',
    color: '#0D0D0D',
  },
  primaryBtn: {
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#0D0D0D',
  },
  link: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#9B9B9B',
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
});
