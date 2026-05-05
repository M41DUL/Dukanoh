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
  },
  inbox: {
    all: ['inbox'] as const,
    list: (userId?: string) =>
      [...queryKeys.inbox.all, 'list', userId] as const,
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
} as const;
