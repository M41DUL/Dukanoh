export const DEFAULT_FEE_PERCENT = 6.5;
export const DEFAULT_FEE_FLAT = 0.80;

/** Dukanoh Safe Checkout charge: feePercent% of item price + feeFlat flat, rounded to 2dp */
export function calcProtectionFee(
  itemPrice: number,
  feePercent = DEFAULT_FEE_PERCENT,
  feeFlat = DEFAULT_FEE_FLAT,
): number {
  return Math.round((itemPrice * (feePercent / 100) + feeFlat) * 100) / 100;
}

/** Total the buyer pays: item price + Safe Checkout charge */
export function calcOrderTotal(
  itemPrice: number,
  feePercent = DEFAULT_FEE_PERCENT,
  feeFlat = DEFAULT_FEE_FLAT,
): number {
  return Math.round((itemPrice + calcProtectionFee(itemPrice, feePercent, feeFlat)) * 100) / 100;
}

/** Seller payout: item price only (Safe Checkout charge goes to platform) */
export function calcSellerPayout(itemPrice: number): number {
  return itemPrice;
}

/** Format a number as GBP string */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}
