/**
 * Price Drop badge — the Pro feature that shows buyers a listing has been
 * reduced.
 *
 * Two rules this module exists to keep in one place:
 *
 *  1. `original_price` and `price_dropped_at` must be written in the same
 *     breath as `price`. They used to be set only by the Pro bulk-edit sheet,
 *     so a Pro seller who lowered one listing's price the obvious way — the
 *     edit screen — got no badge at all.
 *
 *  2. The badge must stop showing when it stops being true. It used to render
 *     on `price_dropped_at` alone, with no check that the price was still
 *     below the original and no expiry, so a seller could drop a price, raise
 *     it again, and keep advertising "↓ Price dropped" at the higher price
 *     indefinitely.
 *
 * Whether the seller is entitled to the badge at all is enforced in the
 * database (see the `enforce_price_drop_tier` trigger), not here — a client
 * can always call PostgREST directly.
 */

/** A drop stops being news after this long. */
export const PRICE_DROP_WINDOW_DAYS = 30;

const WINDOW_MS = PRICE_DROP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface PriceDropFields {
  original_price: number | null;
  price_dropped_at: string | null;
}

/**
 * The badge columns to write alongside a price change.
 *
 * A drop records the old price and stamps the time. Anything else — an
 * increase, or a restore to the same price — clears both, so the badge can't
 * outlive the reduction it describes.
 */
export function priceDropPatch(currentPrice: number, newPrice: number): PriceDropFields {
  return newPrice < currentPrice
    ? { original_price: currentPrice, price_dropped_at: new Date().toISOString() }
    : { original_price: null, price_dropped_at: null };
}

export interface PriceDropReadable {
  price: number;
  original_price?: number | null;
  price_dropped_at?: string | null;
}

/**
 * Whether a listing should advertise a price drop right now.
 *
 * Requires all three: a stamp, an original price still above the current one,
 * and a stamp inside the recency window.
 */
export function showsPriceDrop(listing: PriceDropReadable): boolean {
  const { price, original_price: original, price_dropped_at: droppedAt } = listing;
  if (!droppedAt || original == null) return false;
  if (original <= price) return false;

  const stamped = new Date(droppedAt).getTime();
  if (Number.isNaN(stamped)) return false;
  return Date.now() - stamped < WINDOW_MS;
}
