/**
 * Hierarchical query-key factory.
 *
 * Each feature exposes an `all` root tuple plus narrower tuples that spread
 * the root, so a single
 *   invalidateQueries({ queryKey: queryKeys.<feature>.all })
 * clears every cached entry under that feature.
 *
 * Real keys are added per migration — extend as new screens are migrated.
 */
export const queryKeys = {
  savedItems: {
    all: ['saved-items'] as const,
    list: (userId?: string) =>
      [...queryKeys.savedItems.all, 'list', userId] as const,
    // Lightweight set of saved listing IDs — used by SavedContext so cards
    // across the app can render heart state without fetching full Listing
    // rows. Sibling of `list` so invalidating `savedItems.all` refreshes both.
    ids: (userId?: string) =>
      [...queryKeys.savedItems.all, 'ids', userId] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (userId?: string, role?: 'sold' | 'bought') =>
      [...queryKeys.orders.all, 'list', userId, role] as const,
    detail: (orderId?: string) =>
      [...queryKeys.orders.all, 'detail', orderId] as const,
  },
  myListings: {
    all: ['my-listings'] as const,
    list: (userId?: string, tab?: 'selling' | 'drafts' | 'bought') =>
      [...queryKeys.myListings.all, 'list', userId, tab] as const,
  },
  listings: {
    all: ['listings'] as const,
    detail: (id?: string) =>
      [...queryKeys.listings.all, 'detail', id] as const,
    // Bundle of supplementary data shown on the listing detail screen:
    // similar listings, more-from-seller, offer count, current boost,
    // seller response rate / sold count, and (seller-only) boost quota.
    // Keyed by viewerId + blockedIds because filtering depends on both.
    detailExtras: (
      id?: string,
      viewerId?: string,
      blockedIds: string[] = [],
    ) =>
      [
        ...queryKeys.listings.all,
        'detail-extras',
        id,
        viewerId,
        [...blockedIds].sort(),
      ] as const,
    // Browse + filter + search-results screen (app/listings.tsx). The key
    // includes every dimension that affects results so each unique filter
    // combo gets its own cache entry. Arrays are sorted for determinism so
    // ['blue','red'] and ['red','blue'] collapse to the same key.
    search: (params: {
      term?: string;
      categories?: string[];
      occasion?: string;
      sort?: string;
      subTab?: string;
      sizes?: string[];
      occasions?: string[];
      conditions?: string[];
      colours?: string[];
      fabrics?: string[];
      priceMin?: number | null;
      priceMax?: number | null;
      myListings?: boolean;
      userId?: string;
      blockedIds?: string[];
    }) =>
      [
        ...queryKeys.listings.all,
        'search',
        {
          term: params.term ?? '',
          categories: [...(params.categories ?? [])].sort(),
          occasion: params.occasion ?? '',
          sort: params.sort ?? 'newest',
          subTab: params.subTab ?? 'All',
          sizes: [...(params.sizes ?? [])].sort(),
          occasions: [...(params.occasions ?? [])].sort(),
          conditions: [...(params.conditions ?? [])].sort(),
          colours: [...(params.colours ?? [])].sort(),
          fabrics: [...(params.fabrics ?? [])].sort(),
          priceMin: params.priceMin ?? null,
          priceMax: params.priceMax ?? null,
          myListings: !!params.myListings,
          userId: params.userId,
          blockedIds: [...(params.blockedIds ?? [])].sort(),
        },
      ] as const,
  },
  inbox: {
    all: ['inbox'] as const,
    list: (userId?: string) =>
      [...queryKeys.inbox.all, 'list', userId] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    detail: (conversationId?: string) =>
      [...queryKeys.conversations.all, 'detail', conversationId] as const,
    messages: (conversationId?: string) =>
      [...queryKeys.conversations.all, 'messages', conversationId] as const,
  },
  home: {
    all: ['home'] as const,
    feed: (userId?: string, blockedIds: string[] = []) =>
      [...queryKeys.home.all, 'feed', userId, [...blockedIds].sort()] as const,
    stories: (userId?: string) =>
      [...queryKeys.home.all, 'stories', userId] as const,
    recentlyViewed: (userId?: string) =>
      [...queryKeys.home.all, 'recently-viewed', userId] as const,
  },
  users: {
    all: ['users'] as const,
    preferences: (userId?: string) =>
      [...queryKeys.users.all, 'preferences', userId] as const,
  },
  profile: {
    all: ['profile'] as const,
    // Own profile row read by the profile tab (full_name, avatar_url,
    // rating_avg/count, had_free_trial, pro_expires_at). Distinct from
    // useAuth's profile fetch, which selects a different set of fields.
    overview: (userId?: string) =>
      [...queryKeys.profile.all, 'overview', userId] as const,
    // Global platform_settings rows that drive the Pro entry card's
    // price + founder-tier availability. No userId — same for everyone.
    pricing: () =>
      [...queryKeys.profile.all, 'pricing'] as const,
  },
  adminDisputes: {
    all: ['admin-disputes'] as const,
    list: () => [...queryKeys.adminDisputes.all, 'list'] as const,
  },
  // Pro-only Story Boosts management screen. The single `list` query bundles
  // the user's monthly boost meta (boosts_used / boosts_reset_at on the
  // users row) with their available listings so the screen renders quota +
  // rows from one cache entry.
  boosts: {
    all: ['boosts'] as const,
    list: (userId?: string) =>
      [...queryKeys.boosts.all, 'list', userId] as const,
  },
} as const;
