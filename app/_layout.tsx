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
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { SavedProvider } from '@/context/SavedContext';
import { SplashAnimation } from '@/components/SplashAnimation';

SplashScreen.preventAutoHideAsync();

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

  const { session, loading, onboardingCompleted } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (fontsLoaded && !loading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, loading]);

  useEffect(() => {
    if (!fontsLoaded || loading || !splashDone) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (inAuthGroup) {
      router.replace(onboardingCompleted ? '/(tabs)/' : '/onboarding');
    }
  }, [session, loading, fontsLoaded, segments, router, onboardingCompleted, splashDone]);

  if (!fontsLoaded || loading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
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
          name="become-seller"
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack>
      <StatusBar style="light" />
      {!splashDone && (
        <SplashAnimation
          hasSession={!!session}
          onDone={() => setSplashDone(true)}
          onJoin={() => router.push('/(auth)/signup')}
          onSignIn={() => router.push('/(auth)/login')}
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
          <RootNavigator />
        </SavedProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
