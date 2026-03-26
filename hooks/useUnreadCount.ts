import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns the number of conversations where the most recent message
 * was NOT sent by the current user (i.e. they have an unread reply).
 * Subscribes to realtime updates on the messages table.
 */
export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchCount = async () => {
      // Get all conversations the user is part of
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, buyer_id, seller_id')
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

      if (!convs || convs.length === 0) { setCount(0); return; }

      // For each conversation, get the most recent message
      const checks = convs.map(async (conv) => {
        const { data: latest } = await supabase
          .from('messages')
          .select('sender_id')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Unread if the last message was sent by the other person
        return latest && latest.sender_id !== user.id;
      });

      const results = await Promise.all(checks);
      setCount(results.filter(Boolean).length);
    };

    fetchCount();

    // Re-check when any message is inserted
    const channel = supabase
      .channel('unread-count')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}
