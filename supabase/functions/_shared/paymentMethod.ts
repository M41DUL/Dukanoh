// How a buyer paid, derived from a Stripe charge's
// payment_method_details.card.wallet.type.
//
// Stripe reports a wallet only when one was used; a plain card has no wallet
// object at all. Wallets we don't offer (Samsung Pay, Link) are recorded as
// 'card' rather than invented values, because the orders.payment_method CHECK
// constraint accepts exactly card | google_pay | apple_pay — an unexpected
// string would fail the whole confirmation write, which must never happen over
// a cosmetic field.
export function walletToPaymentMethod(walletType: unknown): 'card' | 'google_pay' | 'apple_pay' {
  if (walletType === 'google_pay') return 'google_pay';
  if (walletType === 'apple_pay') return 'apple_pay';
  return 'card';
}
