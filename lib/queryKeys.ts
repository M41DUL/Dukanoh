/**
 * Hierarchical query-key factory.
 *
 * Each feature exposes an `all` root tuple plus narrower tuples that spread
 * the root, so a single
 *   invalidateQueries({ queryKey: queryKeys.<feature>.all })
 * clears every cached entry under that feature.
 *
 * Real keys are added per migration — this file is intentionally a skeleton.
 */
export const queryKeys = {
  // Example shape (commented out until savedItems is migrated):
  // savedItems: {
  //   all: ['saved-items'] as const,
  //   list: (userId?: string) =>
  //     [...queryKeys.savedItems.all, 'list', userId] as const,
  // },
} as const;
