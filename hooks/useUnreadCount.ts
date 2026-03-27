import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns the number of conversations where the most recent message
 * was NOT sent by the current user (i.e. they have an unread reply).
 * Subscribes to realtime updates on the conversations table.
 */
export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchCount = async () => {
      const { count: unread } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .not('last_message_sender_id', 'is', null)
        .neq('last_message_sender_id', user.id);

      setCount(unread ?? 0);
    };

    fetchCount();

    // Re-check when conversations are updated (trigger fires on new message)
    const channel = supabase
      .channel('unread-count')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}
