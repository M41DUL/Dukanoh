export interface Boostable {
  is_boosted: boolean;
  boost_expires_at: string | null;
}

export function isBoostActive(listing: Boostable, now = new Date()): boolean {
  return (
    listing.is_boosted &&
    listing.boost_expires_at !== null &&
    new Date(listing.boost_expires_at) > now
  );
}
