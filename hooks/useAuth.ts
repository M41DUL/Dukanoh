import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { toSellerTier } from '@/lib/tiers';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [isSeller, setIsSeller] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [sellerTier, setSellerTier] = useState<'free' | 'pro' | 'founder'>('free');

  const [needsUsername, setNeedsUsername] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('onboarding_completed, is_seller, username_confirmed, username, is_verified, is_official, seller_tier, pro_expires_at')
      .eq('id', userId)
      .maybeSingle();
    setOnboardingCompleted(data?.onboarding_completed ?? false);
    setIsSeller(data?.is_seller ?? false);
    setNeedsUsername(!(data?.username_confirmed ?? true));
    setUsername(data?.username ?? '');
    setIsVerified(data?.is_verified ?? false);
    setIsOfficial(data?.is_official ?? false);
    // Treat an expired subscription as free even while seller_tier still
    // says otherwise. The nightly sweep is the thing that rewrites the
    // column, so without this a member whose EXPIRATION webhook was missed
    // keeps the Pro UI for up to 24 hours — and every server-side gate
    // (has_pro_access) would already be refusing them, which reads as the
    // app being broken rather than the subscription having lapsed.
    const expiresAt = data?.pro_expires_at ? new Date(data.pro_expires_at as string) : null;
    const lapsed = expiresAt !== null && expiresAt <= new Date();
    setSellerTier(lapsed ? 'free' : toSellerTier(data?.seller_tier));
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.user) await fetchProfile(s.user.id);
  }, [fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchProfile(s.user.id);
        // Best-effort: bump last_active_at on app open. Powers the
        // "active in last X days" audience filter for admin broadcasts.
        // Fire-and-forget; never blocks startup if it fails.
        supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', s.user.id).then(() => {});
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user) {
        fetchProfile(s.user.id).then(() => {
          setSession(s);
          setUser(s.user ?? null);
        });
      } else {
        setOnboardingCompleted(null);
        setIsSeller(false);
        setIsVerified(false);
        setIsOfficial(false);
        setSellerTier('free');
        setNeedsUsername(false);
        setUsername('');
        setSession(s);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = async () => {
    // Remove push token for this device before signing out
    if (user) {
      try {
        const Notifications = await import('expo-notifications');
        // projectId is required in bare/EAS builds; without it this call throws
        // and the swallowed error left the token registered after sign-out.
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (token) {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', user.id)
            .eq('token', token);
        }
      } catch {}
    }

    // Clear local-state AsyncStorage so the next user doesn't inherit
    // theme/recently-viewed UI state. The home feed cache used to live
    // here too but is now in TanStack Query; queryClient.clear() below
    // handles it.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(k =>
        k.startsWith('recently_viewed_') ||
        k.startsWith('theme_')
      );
      if (appKeys.length > 0) await AsyncStorage.multiRemove(appKeys);
    } catch {}

    // Sign out of Google so a different account can be selected next time
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {}

    // Reset RevenueCat so the next user doesn't inherit this user's entitlements
    try {
      const Purchases = await import('react-native-purchases');
      await Purchases.default.logOut();
    } catch {}

    await supabase.auth.signOut();

    // Drop all React Query cache so the next user doesn't see the previous
    // user's data while their own queries refetch.
    queryClient.clear();
  };

  return { session, user, loading, signOut, onboardingCompleted, isSeller, isVerified, isOfficial, sellerTier, needsUsername, username, refreshProfile };
}
