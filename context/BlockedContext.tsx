import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface BlockedContextValue {
  blockedIds: string[];
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const BlockedContext = createContext<BlockedContextValue>({
  blockedIds: [],
  isBlocked: () => false,
  blockUser: async () => {},
  unblockUser: async () => {},
  reload: async () => {},
});

export function BlockedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const fetchBlocked = useCallback(async () => {
    if (!user) { setBlockedIds([]); return; }
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);
    setBlockedIds(data?.map(r => r.blocked_id) ?? []);
  }, [user]);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  const isBlocked = useCallback((userId: string) => blockedIds.includes(userId), [blockedIds]);

  const blockUser = useCallback(async (userId: string) => {
    if (!user) return;
    await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: userId });
    setBlockedIds(prev => [...prev, userId]);
  }, [user]);

  const unblockUser = useCallback(async (userId: string) => {
    if (!user) return;
    await supabase.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', userId);
    setBlockedIds(prev => prev.filter(id => id !== userId));
  }, [user]);

  return (
    <BlockedContext.Provider value={{ blockedIds, isBlocked, blockUser, unblockUser, reload: fetchBlocked }}>
      {children}
    </BlockedContext.Provider>
  );
}

export const useBlocked = () => useContext(BlockedContext);
