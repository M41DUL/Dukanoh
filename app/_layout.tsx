import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Inter_100Thin,
  Inter_200ExtraLight,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '@/hooks/useAuth';
import { configureGoogleSignIn } from '@/lib/socialAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { SavedProvider } from '@/context/SavedContext';
import { BlockedProvider } from '@/context/BlockedContext';
import { SplashAnimation } from '@/components/SplashAnimation';

SplashScreen.preventAutoHideAsync();
configureGoogleSignIn();

function RootNavigator() {
  const [fontsLoaded] = useFonts({
    Inter_100Thin,
    Inter_200ExtraLight,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const { session, loading, onboardingCompleted, needsUsername } = useAuth();
  usePushNotifications();
  const router = useRouter();
  const segments = useSegments();
  const { isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    if (fontsLoaded && !loading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, loading]);

  // Navigate to the correct route once splash animation finishes
  useEffect(() => {
    if (!fontsLoaded || loading || !splashDone || routeReady) return;

    if (!session) {
      const inAuthGroup = segments[0] === '(auth)';
      if (!inAuthGroup) router.replace('/(auth)/intro');
    } else {
      if (needsUsername) {
        router.replace('/username-picker');
      } else {
        router.replace(onboardingCompleted ? '/(tabs)' : '/onboarding');
      }
    }
    // Wait for route to mount, then tell splash to fade out
    setTimeout(() => setRouteReady(true), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashDone, fontsLoaded, loading]); // intentional: fires once when splash finishes; other deps intentionally excluded

  // Handle auth state changes after initial navigation (e.g. login/logout)
  useEffect(() => {
    if (!fontsLoaded || loading || !routeReady || splashVisible) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/intro');
    } else if (inAuthGroup) {
      if (needsUsername) {
        router.replace('/username-picker');
      } else {
        router.replace(onboardingCompleted ? '/(tabs)' : '/onboarding');
      }
    }
  }, [session, loading, fontsLoaded, segments, router, onboardingCompleted, needsUsername, routeReady, splashVisible]);

  if (!fontsLoaded || loading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="username-picker" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen
          name="listings"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="listing/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="conversation/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="saved"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="review/[listingId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="user/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="listing/edit/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="reset-password"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="orders"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="settings"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="invite-friends"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="how-it-works"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="seller-hub"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="settings/address"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="checkout/[listingId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="order/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="order/[id]/dispute"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="wallet"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="stripe-onboarding"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="admin/disputes"
          options={{ animation: 'slide_from_right' }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {splashVisible && (
        <SplashAnimation
          onAnimationDone={() => setSplashDone(true)}
          fadeOut={routeReady}
          onFadeOutDone={() => setSplashVisible(false)}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SavedProvider>
          <BlockedProvider>
            <RootNavigator />
          </BlockedProvider>
        </SavedProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
