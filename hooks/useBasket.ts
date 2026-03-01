import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { Listing } from '@/components/ListingCard';

export interface BasketItem {
  id: string;
  listing_id: string;
  created_at: string;
  listing: Listing;
}

export function useBasket() {
  const { user } = useAuth();
  const [items, setItems] = useState<BasketItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from('basket_items')
      .select('*, listing:listings(*, seller:users(username, avatar_url))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setItems((data as unknown as BasketItem[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const addItem = async (listingId: string) => {
    if (!user) return;
    await supabase
      .from('basket_items')
      .insert({ user_id: user.id, listing_id: listingId });
    await fetch();
  };

  const removeItem = async (listingId: string) => {
    if (!user) return;
    await supabase
      .from('basket_items')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', listingId);
    setItems(prev => prev.filter(i => i.listing_id !== listingId));
  };

  const isInBasket = (listingId: string) =>
    items.some(i => i.listing_id === listingId);

  return { items, count: items.length, loading, addItem, removeItem, isInBasket, refresh: fetch };
}
