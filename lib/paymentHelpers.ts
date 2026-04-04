/**
 * Pure payment calculation helpers.
 * Extracted here so they can be unit-tested independently of the UI.
 */

/** Buyer protection fee: 6.5% of item price + £0.80 flat, rounded to 2dp */
export function calcProtectionFee(itemPrice: number): number {
  return Math.round((itemPrice * 0.065 + 0.8) * 100) / 100;
}

/** Total the buyer pays: item price + protection fee */
export function calcOrderTotal(itemPrice: number): number {
  return Math.round((itemPrice + calcProtectionFee(itemPrice)) * 100) / 100;
}

/** Seller payout: item price only (protection fee goes to platform) */
export function calcSellerPayout(itemPrice: number): number {
  return itemPrice;
}

/** Format a number as GBP string */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
