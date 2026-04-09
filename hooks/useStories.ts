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

const APP_MESSAGES: Omit<AppStory, 'type' | 'id'>[] = [
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
  is_boosted?: boolean;
  created_at?: string;
  seller_id?: string;
  seller: {
    username: string;
    avatar_url?: string;
  };
}

const LISTING_SELECT =
  'id, title, price, images, category, condition, status, created_at, seller_id, seller:users!listings_seller_id_fkey(username, avatar_url, seller_tier, is_verified)';

export function useStories() {
  const { user } = useAuth();
  const [stories, setStories] = useState<StoryListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Organic window: 5 hours
    const since5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const [
      { data: organicListings },
      { data: activeBoosts },
      { data: basketItems },
      { data: viewedListings },
      { data: viewedStories },
    ] = await Promise.all([
      // Organic: listed in last 5 hours, exclude own
      supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('status', 'available')
        .neq('seller_id', user.id)
        .gte('created_at', since5h)
        .order('created_at', { ascending: false })
        .limit(50),

      // Active boosts from boosts table — source of truth
      supabase
        .from('boosts')
        .select('listing_id')
        .gt('expires_at', now),

      // Personalisation: basket categories
      supabase
        .from('basket_items')
        .select('listing:listings(category)')
        .eq('user_id', user.id),

      // Personalisation: recently viewed categories
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

    // Fetch boosted listings by ID (exclude own)
    const boostedIds = (activeBoosts ?? []).map(b => b.listing_id);
    const boostedListings = boostedIds.length > 0
      ? (await supabase
          .from('listings')
          .select(LISTING_SELECT)
          .in('id', boostedIds)
          .eq('status', 'available')
          .neq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
        ).data
      : [];

    const viewedIds = new Set(viewedStories?.map(s => s.listing_id) ?? []);

    const preferredCategories = new Set<string>([
      ...(basketItems?.map((b: any) => b.listing?.category).filter(Boolean) ?? []),
      ...(viewedListings?.map((v: any) => v.listing?.category).filter(Boolean) ?? []),
    ]);

    // Merge boosted + organic, dedup by id
    // Mark boosted listings with is_boosted flag for sort/display
    const boostedIdSet = new Set(boostedIds);
    const seenIds = new Set<string>();
    const merged: StoryListing[] = [];
    for (const l of [...(boostedListings ?? []), ...(organicListings ?? [])]) {
      if (seenIds.has(l.id)) continue;
      seenIds.add(l.id);
      merged.push({ ...(l as unknown as StoryListing), is_boosted: boostedIdSet.has(l.id) });
    }

    // Dedup to one listing per seller (keep most recently created — already ordered desc)
    const seenSellers = new Set<string>();
    const deduped: StoryListing[] = [];
    for (const l of merged) {
      const sellerId = l.seller_id ?? '';
      if (seenSellers.has(sellerId)) continue;
      seenSellers.add(sellerId);
      deduped.push(l);
    }

    // Sort: boosted unviewed → unviewed + preferred → unviewed → viewed
    const sorted = [...deduped].sort((a, b) => {
      const aViewed = viewedIds.has(a.id) ? 1 : 0;
      const bViewed = viewedIds.has(b.id) ? 1 : 0;
      if (aViewed !== bViewed) return aViewed - bViewed;

      // Both unviewed — boosted first
      const aBoosted = a.is_boosted ? 0 : 1;
      const bBoosted = b.is_boosted ? 0 : 1;
      if (aBoosted !== bBoosted) return aBoosted - bBoosted;

      // Then preferred category
      const aPref = preferredCategories.has(a.category) ? 0 : 1;
      const bPref = preferredCategories.has(b.category) ? 0 : 1;
      return aPref - bPref;
    });

    setStories(
      sorted.map(l => ({
        ...l,
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
