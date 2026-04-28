import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

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
      // Remove this token from any other user (handles device re-use after login switch)
      await supabase.from('push_tokens').delete().eq('token', token).neq('user_id', user.id);
      // Save token for current user
      await supabase.from('push_tokens').upsert(
        { user_id: user.id, token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );
    }).catch(() => {});

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

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

  return tokenData.data;
}
