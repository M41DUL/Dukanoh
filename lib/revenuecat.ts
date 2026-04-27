import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

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

/**
 * Checks the live RevenueCat entitlement status and syncs it to Supabase.
 * Catches subscription lapses or restorations the DB doesn't yet know about.
 */
export async function syncProEntitlement(userId: string): Promise<void> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    const isActive = entitlement != null;
    const expiryDate = entitlement?.expirationDate ?? null;

    const { data: userRow } = await supabase
      .from('users')
      .select('seller_tier, pro_expires_at')
      .eq('id', userId)
      .single();

    const dbTier = userRow?.seller_tier ?? 'free';
    const dbIsPro = dbTier === 'pro' || dbTier === 'founder';

    if (isActive && !dbIsPro) {
      // RevenueCat says active but DB says free — subscription restored or webhook missed
      await supabase
        .from('users')
        .update({ seller_tier: 'pro', pro_expires_at: expiryDate, had_free_trial: true })
        .eq('id', userId);
    } else if (!isActive && dbIsPro) {
      // RevenueCat says lapsed but DB still says pro — subscription expired
      await supabase
        .from('users')
        .update({ seller_tier: 'free', pro_expires_at: null })
        .eq('id', userId);
    }
  } catch {
    // Silent — RevenueCat unavailable in Expo Go or network error
  }
}
