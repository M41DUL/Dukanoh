import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

export const ENTITLEMENT_ID = 'dukanoh_pro';

export function initRevenueCat(userId: string) {
  try {
    if (!Purchases) return;
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

    const apiKey = Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? ''
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

    Purchases.configure({ apiKey, appUserID: userId });
  } catch {
    // Native module unavailable in Expo Go — works in dev/prod builds
  }
}
