/**
 * Pure order state machine helpers.
 * Extracted here so they can be unit-tested independently of the UI.
 */

export type OrderStatus =
  | 'created'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export interface OrderActions {
  canShip: boolean;
  canConfirm: boolean;
  canDispute: boolean;
  canCancel: boolean;
  canWithdrawDispute: boolean;
  isDisputed: boolean;
}

/**
 * Derives which actions are available for an order given its current status
 * and whether the current user is the buyer or seller.
 */
export function getOrderActions(
  status: OrderStatus,
  isBuyer: boolean,
  isSeller: boolean,
): OrderActions {
  return {
    canShip:             isSeller && status === 'paid',
    canConfirm:          isBuyer  && status === 'shipped',
    canDispute:          isBuyer  && (status === 'shipped' || status === 'delivered'),
    canCancel:           (isBuyer || isSeller) && (status === 'paid' || status === 'created'),
    canWithdrawDispute:  isBuyer  && status === 'disputed',
    isDisputed:          status === 'disputed',
  };
}

/**
 * Returns true if the order is in a terminal state (no further transitions possible
 * from the user side).
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ['completed', 'cancelled'].includes(status);
}

/**
 * Returns true if this status transition would trigger a wallet credit for the seller.
 * Mirrors the DB trigger logic so the UI can reason about it.
 */
export function triggersWalletCredit(
  oldStatus: OrderStatus,
  newStatus: OrderStatus,
): boolean {
  return (
    (oldStatus === 'shipped' || oldStatus === 'delivered') &&
    newStatus === 'completed'
  );
}

/**
 * Returns true if this status transition moves funds into seller pending balance.
 */
export function triggersWalletPending(
  oldStatus: OrderStatus,
  newStatus: OrderStatus,
): boolean {
  return oldStatus === 'paid' && newStatus === 'shipped';
}
