import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { reportError } from '@/lib/errorReporting';

// Tracks the conversation ID the user is currently viewing.
// Set by the conversation screen on mount/unmount.
export const activeConversationId = { current: null as string | null };

try {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      // Suppress message notifications if user is already in that conversation
      if (
        data?.conversation_id &&
        data.conversation_id === activeConversationId.current
      ) {
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
      }
      return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true };
    },
  });
} catch {}

export function usePushNotifications() {
  const { user } = useAuth();
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined>(undefined);

  // Clear badge when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    // Also clear immediately on mount
    Notifications.setBadgeCountAsync(0).catch(() => {});
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then(async (token) => {
      if (!token) return;
      // A push token identifies this device. register_push_token detaches it from
      // any other account (a client can't, under RLS) and claims it for the
      // current user — one atomic, server-side step.
      const { error } = await supabase.rpc('register_push_token', { p_token: token });
      if (error) reportError(new Error(`register_push_token failed: ${error.message}`), 'push/save');
    }).catch(e => reportError(e, 'push/register'));

    // Navigate when user taps a notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.conversation_id) {
          router.push(`/conversation/${data.conversation_id}`);
        } else if (data?.order_id) {
          router.push(`/order/${data.order_id}`);
        } else if (data?.listing_id) {
          router.push(`/listing/${data.listing_id}`);
        }
      });

    return () => {
      try {
        if (responseListener.current) {
          responseListener.current.remove();
        }
      } catch {}
    };
  }, [user]);
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Report rather than bail silently: a denied permission is the difference
  // between "push is off for this user" and "push is broken", and we had no way
  // to tell them apart.
  if (finalStatus !== 'granted') {
    reportError(new Error(`permission not granted (status=${finalStatus})`), 'push/permission');
    return null;
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (e) {
      reportError(e, 'push/channel');
    }
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    reportError(new Error('missing EAS projectId in expoConfig.extra'), 'push/projectId');
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (e: any) {
    // The one that matters: on Android this is where FCM/Play Services failures
    // surface, and it was being swallowed by the caller's empty catch.
    reportError(
      new Error(`getExpoPushToken failed (code=${e?.code ?? '?'}) ${e?.message ?? e}`),
      'push/getToken'
    );
    return null;
  }
}
