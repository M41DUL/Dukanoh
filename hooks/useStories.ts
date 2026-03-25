import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface AppStory {
  type: 'app';
  id: 'dukanoh-app-story';
  imageUrl?: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaRoute: string;
}

const APP_MESSAGES: Array<Omit<AppStory, 'type' | 'id'>> = [
  {
    headline: 'Welcome to Dukanoh',
    body: 'The South Asian fashion marketplace. Buy and sell pre-loved clothing from your community.',
    ctaLabel: 'Start browsing',
    ctaRoute: '/listings',
  },
  {
    headline: 'How it works',
    body: 'Browse listings, message sellers directly, and arrange collection or delivery between you.',
    ctaLabel: 'Explore now',
    ctaRoute: '/listings',
  },
  {
    headline: 'Discover your style',
    body: 'Lehengas, sherwanis, sarees and more — all pre-loved, all at a fraction of the price.',
    ctaLabel: 'Browse listings',
    ctaRoute: '/listings',
  },
  {
    headline: 'Join the community',
    body: 'Save your favourites, follow price drops, and find outfits for every occasion.',
    ctaLabel: 'Get started',
    ctaRoute: '/listings',
  },
];

export function getAppStory(): AppStory {
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const msg = APP_MESSAGES[weekNumber % APP_MESSAGES.length];
  return { type: 'app', id: 'dukanoh-app-story', ...msg };
}

export interface StoryListing {
  type?: never;
  id: string;
  title: string;
  price: number;
  category: string;
  condition: string;
  images: string[];
  status: 'available' | 'sold';
  viewed: boolean;
  created_at?: string;
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
        .select('id, title, price, images, category, condition, status, created_at, seller:users(username, avatar_url)')
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
