import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user) return;
    const { count: unread } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .not('last_message_sender_id', 'is', null)
      .neq('last_message_sender_id', user.id);
    setCount(unread ?? 0);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchCount();

    // Refresh when app comes to foreground
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchCount();
    });

    // Refresh when a message notification arrives while the app is open
    const notifSub = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.conversation_id) fetchCount();
    });

    return () => {
      appStateSub.remove();
      notifSub.remove();
    };
  }, [user, fetchCount]);

  return { count, refresh: fetchCount };
}
