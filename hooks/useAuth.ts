import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [isSeller, setIsSeller] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [sellerTier, setSellerTier] = useState<string>('free');

  const [needsUsername, setNeedsUsername] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('onboarding_completed, is_seller, username_confirmed, username, is_verified, seller_tier')
      .eq('id', userId)
      .maybeSingle();
    setOnboardingCompleted(data?.onboarding_completed ?? false);
    setIsSeller(data?.is_seller ?? false);
    setNeedsUsername(!(data?.username_confirmed ?? true));
    setUsername(data?.username ?? '');
    setIsVerified(data?.is_verified ?? false);
    setSellerTier(data?.seller_tier ?? 'free');
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.user) await fetchProfile(s.user.id);
  }, [fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await fetchProfile(s.user.id);
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
        const { data: tokenData } = await Notifications.getExpoPushTokenAsync();
        if (tokenData) {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', user.id)
            .eq('token', tokenData);
        }
      } catch {}
    }

    // Clear all app-level AsyncStorage cache so stale data
    // doesn't bleed into the next session (e.g. a different user)
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(k =>
        k.startsWith('feed_') ||
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

    await supabase.auth.signOut();
  };

  return { session, user, loading, signOut, onboardingCompleted, isSeller, isVerified, sellerTier, needsUsername, username, refreshProfile };
}
