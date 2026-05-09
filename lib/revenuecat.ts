import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/errorReporting';

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
 * Compares the live RevenueCat entitlement against what the DB believes,
 * and reports any drift. Does NOT write seller_tier / pro_expires_at /
 * had_free_trial — those columns are locked by RLS and only the
 * revenuecat-webhook edge function (service role) is authorised to
 * update them. Allowing client-side writes would let any authenticated
 * user promote themselves to Pro by calling supabase.from('users')
 * .update({ seller_tier: 'pro' }) directly.
 *
 * If the webhook is delayed and a paying customer sees themselves as
 * free in the app, this function logs the drift via reportError so it
 * surfaces in the error dashboard. Reconciliation is a webhook
 * concern, not a client concern.
 */
export async function syncProEntitlement(userId: string): Promise<void> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    const isActive = entitlement != null;

    const { data: userRow } = await supabase
      .from('users')
      .select('seller_tier')
      .eq('id', userId)
      .single();

    const dbTier = userRow?.seller_tier ?? 'free';
    const dbIsPro = dbTier === 'pro' || dbTier === 'founder';

    if (isActive !== dbIsPro) {
      // Drift between RevenueCat and DB. Likely a delayed/missed webhook
      // — log so we can investigate, but DO NOT attempt to write here.
      reportError(
        new Error(
          `RC/DB tier drift: RC=${isActive ? 'active' : 'inactive'} DB=${dbTier}`,
        ),
        'syncProEntitlement',
      );
    }
  } catch {
    // Silent — RevenueCat unavailable in Expo Go or network error
  }
}
