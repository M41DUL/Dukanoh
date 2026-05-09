import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

interface UseAuthRedirectArgs {
  session: Session | null;
  loading: boolean;
  fontsLoaded: boolean;
  needsUsername: boolean;
  onboardingCompleted: boolean | null;
  splashDone: boolean;
  splashVisible: boolean;
}

/**
 * Owns the root navigation redirect.
 *
 * Two phases live in one effect:
 *
 *  - **Initial nav**: from app boot until the user has been redirected
 *    to the correct entry route. Waits for fonts, auth, and the splash
 *    animation to all finish before deciding where the user should land.
 *    Always redirects (sets the route, doesn't just react to drift).
 *
 *  - **Runtime nav**: after initial nav is done and the splash is
 *    hidden. Only redirects to react to auth changes (login, logout,
 *    profile updates) — i.e. when the user is currently in the auth
 *    group but should be in the app, or vice versa. Doesn't yank
 *    the user off a screen they navigated to themselves.
 *
 * Returns `routeReady` so the caller can hand it to the splash overlay's
 * fade-out trigger (the splash holds until the right route has mounted).
 */
export function useAuthRedirect({
  session,
  loading,
  fontsLoaded,
  needsUsername,
  onboardingCompleted,
  splashDone,
  splashVisible,
}: UseAuthRedirectArgs): boolean {
  const router = useRouter();
  const segments = useSegments();
  const [routeReady, setRouteReady] = useState(false);

  useEffect(() => {
    if (!fontsLoaded || loading) return;

    const isInitialNav = !routeReady;
    if (isInitialNav && !splashDone) return;
    if (!isInitialNav && splashVisible) return;

    const inAuthGroup = segments[0] === '(auth)';
    const targetForInitial =
      !session
        ? (inAuthGroup ? null : '/(auth)/intro')
        : needsUsername
          ? '/username-picker'
          : !onboardingCompleted
            ? '/onboarding'
            : '/(tabs)';

    // Runtime phase only redirects on auth-driven *transitions* —
    // unauthenticated users out of the app, authed users out of (auth).
    const targetForRuntime =
      !session
        ? (inAuthGroup ? null : '/(auth)/intro')
        : inAuthGroup
          ? targetForInitial
          : null;

    const target = isInitialNav ? targetForInitial : targetForRuntime;
    if (target) router.replace(target);

    if (isInitialNav) {
      // Defer the splash fade-out until the new route has had a tick
      // to mount, so users don't see a frame of the previous screen.
      setTimeout(() => setRouteReady(true), 100);
    }
  }, [
    fontsLoaded,
    loading,
    splashDone,
    splashVisible,
    routeReady,
    session,
    needsUsername,
    onboardingCompleted,
    segments,
    router,
  ]);

  return routeReady;
}
