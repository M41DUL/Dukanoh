import { Alert } from 'react-native';

/**
 * Listing writes fail with whatever Postgres said — foreign-key constraint
 * names, row-level-security policy text. That belongs in the log, not in front
 * of a member who was trying to tidy their wardrobe.
 *
 * Callers handle the failures that carry real meaning (ActiveOrderExistsError)
 * before reaching here; anything arriving at this point is, from the member's
 * side, simply "it didn't work" — so it says that, and invites a retry.
 */
export function reportListingError(action: 'delete' | 'save', err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`listing ${action} failed:`, err instanceof Error ? err.message : err);
  Alert.alert(
    action === 'delete' ? "Couldn't delete" : "Couldn't save",
    "That didn't go through — give it another try.",
  );
}
