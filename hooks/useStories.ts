import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface StoryListing {
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  status: 'available' | 'sold';
  viewed: boolean;
  seller: {
    username: string;
    avatar_url?: string;
  };
}

export function useStories() {
  const { user } = useAuth();
  const [stories, setStories] = useState<StoryListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [
      { data: listings },
      { data: basketItems },
      { data: viewedListings },
      { data: viewedStories },
    ] = await Promise.all([
      // 24h available listings (exclude own)
      supabase
        .from('listings')
        .select('*, seller:users(username, avatar_url)')
        .eq('status', 'available')
        .neq('seller_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),

      // User's basket categories (personalisation signal 1)
      supabase
        .from('basket_items')
        .select('listing:listings(category)')
        .eq('user_id', user.id),

      // Recently viewed categories (personalisation signal 2)
      supabase
        .from('listing_views')
        .select('listing:listings(category)')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(30),

      // Already viewed stories
      supabase
        .from('story_views')
        .select('listing_id')
        .eq('user_id', user.id),
    ]);

    // Build preferred categories set
    const preferredCategories = new Set<string>([
      ...(basketItems?.map((b: any) => b.listing?.category).filter(Boolean) ?? []),
      ...(viewedListings?.map((v: any) => v.listing?.category).filter(Boolean) ?? []),
    ]);

    const viewedIds = new Set(viewedStories?.map(s => s.listing_id) ?? []);

    // Sort: unviewed + preferred first, then unviewed, then viewed
    const sorted = [...(listings ?? [])].sort((a, b) => {
      const aViewed = viewedIds.has(a.id) ? 1 : 0;
      const bViewed = viewedIds.has(b.id) ? 1 : 0;
      if (aViewed !== bViewed) return aViewed - bViewed;

      const aPref = preferredCategories.has(a.category) ? 0 : 1;
      const bPref = preferredCategories.has(b.category) ? 0 : 1;
      return aPref - bPref;
    });

    setStories(
      sorted.map(l => ({
        ...(l as unknown as StoryListing),
        viewed: viewedIds.has(l.id),
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const markViewed = async (listingId: string) => {
    if (!user) return;

    // Optimistic update
    setStories(prev =>
      prev.map(s => (s.id === listingId ? { ...s, viewed: true } : s))
    );

    await Promise.all([
      supabase
        .from('story_views')
        .upsert({ user_id: user.id, listing_id: listingId }),
      supabase
        .from('listing_views')
        .insert({ user_id: user.id, listing_id: listingId }),
    ]);
  };

  return { stories, loading, markViewed, refresh: fetch };
}
