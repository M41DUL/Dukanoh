import {
  getOrderActions,
  isTerminalStatus,
  triggersWalletCredit,
  triggersWalletPending,
  OrderStatus,
} from '../lib/orderHelpers';

// ─── Test fixtures ─────────────────────────────────────────────

const ALL_STATUSES: OrderStatus[] = [
  'created', 'paid', 'shipped', 'delivered',
  'completed', 'disputed', 'resolved', 'cancelled',
];

// ─── getOrderActions — seller perspective ──────────────────────

describe('getOrderActions — seller', () => {
  const seller = (status: OrderStatus) => getOrderActions(status, false, true);

  test('can ship when order is paid', () => {
    expect(seller('paid').canShip).toBe(true);
  });

  test('cannot ship when already shipped', () => {
    expect(seller('shipped').canShip).toBe(false);
  });

  test('cannot ship from any status other than paid', () => {
    const nonPaid = ALL_STATUSES.filter(s => s !== 'paid');
    nonPaid.forEach(status => {
      expect(seller(status).canShip).toBe(false);
    });
  });

  test('cannot confirm receipt (buyer-only action)', () => {
    ALL_STATUSES.forEach(status => {
      expect(seller(status).canConfirm).toBe(false);
    });
  });

  test('cannot raise dispute (buyer-only action)', () => {
    ALL_STATUSES.forEach(status => {
      expect(seller(status).canDispute).toBe(false);
    });
  });

  test('can cancel when order is paid', () => {
    expect(seller('paid').canCancel).toBe(true);
  });

  test('can cancel when order is created', () => {
    expect(seller('created').canCancel).toBe(true);
  });

  test('cannot cancel once shipped', () => {
    expect(seller('shipped').canCancel).toBe(false);
    expect(seller('completed').canCancel).toBe(false);
    expect(seller('disputed').canCancel).toBe(false);
  });

  test('cannot withdraw dispute (buyer-only action)', () => {
    ALL_STATUSES.forEach(status => {
      expect(seller(status).canWithdrawDispute).toBe(false);
    });
  });
});

// ─── getOrderActions — buyer perspective ───────────────────────

describe('getOrderActions — buyer', () => {
  const buyer = (status: OrderStatus) => getOrderActions(status, true, false);

  test('cannot ship (seller-only action)', () => {
    ALL_STATUSES.forEach(status => {
      expect(buyer(status).canShip).toBe(false);
    });
  });

  test('can confirm receipt when shipped', () => {
    expect(buyer('shipped').canConfirm).toBe(true);
  });

  test('cannot confirm receipt from other statuses', () => {
    const nonShipped = ALL_STATUSES.filter(s => s !== 'shipped');
    nonShipped.forEach(status => {
      expect(buyer(status).canConfirm).toBe(false);
    });
  });

  test('can raise dispute when shipped', () => {
    expect(buyer('shipped').canDispute).toBe(true);
  });

  test('cannot raise dispute before shipment', () => {
    expect(buyer('paid').canDispute).toBe(false);
    expect(buyer('created').canDispute).toBe(false);
  });

  test('cannot raise dispute on completed orders', () => {
    expect(buyer('completed').canDispute).toBe(false);
    expect(buyer('cancelled').canDispute).toBe(false);
  });

  test('can cancel when order is paid or created', () => {
    expect(buyer('paid').canCancel).toBe(true);
    expect(buyer('created').canCancel).toBe(true);
  });

  test('cannot cancel once shipped', () => {
    expect(buyer('shipped').canCancel).toBe(false);
    expect(buyer('completed').canCancel).toBe(false);
  });

  test('can withdraw dispute when disputed', () => {
    expect(buyer('disputed').canWithdrawDispute).toBe(true);
  });

  test('cannot withdraw dispute when not disputed', () => {
    const nonDisputed = ALL_STATUSES.filter(s => s !== 'disputed');
    nonDisputed.forEach(status => {
      expect(buyer(status).canWithdrawDispute).toBe(false);
    });
  });
});

// ─── getOrderActions — isDisputed flag ────────────────────────

describe('getOrderActions — isDisputed', () => {
  test('isDisputed is true only when status is disputed', () => {
    expect(getOrderActions('disputed', true, false).isDisputed).toBe(true);
    expect(getOrderActions('disputed', false, true).isDisputed).toBe(true);
  });

  test('isDisputed is false for all other statuses', () => {
    const nonDisputed = ALL_STATUSES.filter(s => s !== 'disputed');
    nonDisputed.forEach(status => {
      expect(getOrderActions(status, true, false).isDisputed).toBe(false);
    });
  });
});

// ─── getOrderActions — neither buyer nor seller ────────────────

describe('getOrderActions — third party', () => {
  test('no actions available for unrelated user', () => {
    ALL_STATUSES.forEach(status => {
      const actions = getOrderActions(status, false, false);
      expect(actions.canShip).toBe(false);
      expect(actions.canConfirm).toBe(false);
      expect(actions.canDispute).toBe(false);
      expect(actions.canCancel).toBe(false);
      expect(actions.canWithdrawDispute).toBe(false);
    });
  });
});

// ─── isTerminalStatus ─────────────────────────────────────────

describe('isTerminalStatus', () => {
  test('completed is terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
  });

  test('resolved is terminal', () => {
    expect(isTerminalStatus('resolved')).toBe(true);
  });

  test('cancelled is terminal', () => {
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  test('active statuses are not terminal', () => {
    (['created', 'paid', 'shipped', 'delivered', 'disputed'] as OrderStatus[]).forEach(s => {
      expect(isTerminalStatus(s)).toBe(false);
    });
  });
});

// ─── triggersWalletCredit ─────────────────────────────────────

describe('triggersWalletCredit', () => {
  test('shipped → completed triggers credit', () => {
    expect(triggersWalletCredit('shipped', 'completed')).toBe(true);
  });

  test('delivered → completed triggers credit', () => {
    expect(triggersWalletCredit('delivered', 'completed')).toBe(true);
  });

  test('paid → completed does not trigger credit (invalid transition)', () => {
    expect(triggersWalletCredit('paid', 'completed')).toBe(false);
  });

  test('shipped → cancelled does not trigger credit', () => {
    expect(triggersWalletCredit('shipped', 'cancelled')).toBe(false);
  });

  test('shipped → disputed does not trigger credit', () => {
    expect(triggersWalletCredit('shipped', 'disputed')).toBe(false);
  });

  test('no other transitions trigger credit', () => {
    const nonCreditTransitions: [OrderStatus, OrderStatus][] = [
      ['created', 'paid'],
      ['paid', 'shipped'],
      ['paid', 'cancelled'],
      ['disputed', 'resolved'],
    ];
    nonCreditTransitions.forEach(([from, to]) => {
      expect(triggersWalletCredit(from, to)).toBe(false);
    });
  });
});

// ─── triggersWalletPending ────────────────────────────────────

describe('triggersWalletPending', () => {
  test('paid → shipped moves funds to pending', () => {
    expect(triggersWalletPending('paid', 'shipped')).toBe(true);
  });

  test('no other transition moves funds to pending', () => {
    const nonPendingTransitions: [OrderStatus, OrderStatus][] = [
      ['created', 'paid'],
      ['shipped', 'completed'],
      ['shipped', 'disputed'],
      ['shipped', 'cancelled'],
      ['disputed', 'completed'],
    ];
    nonPendingTransitions.forEach(([from, to]) => {
      expect(triggersWalletPending(from, to)).toBe(false);
    });
  });
});

// ─── Full buyer journey state machine ─────────────────────────

describe('buyer journey — state machine', () => {
  test('buyer cannot act on a freshly paid order (waiting for seller to ship)', () => {
    const actions = getOrderActions('paid', true, false);
    expect(actions.canConfirm).toBe(false);
    expect(actions.canDispute).toBe(false);
    expect(actions.canShip).toBe(false);
  });

  test('buyer can confirm or dispute once seller has shipped', () => {
    const actions = getOrderActions('shipped', true, false);
    expect(actions.canConfirm).toBe(true);
    expect(actions.canDispute).toBe(true);
  });

  test('completing an order triggers wallet credit and no further actions', () => {
    expect(triggersWalletCredit('shipped', 'completed')).toBe(true);
    const actions = getOrderActions('completed', true, false);
    expect(actions.canConfirm).toBe(false);
    expect(actions.canDispute).toBe(false);
    expect(actions.canCancel).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
  });

  test('buyer can withdraw dispute to release funds to seller', () => {
    const actions = getOrderActions('disputed', true, false);
    expect(actions.canWithdrawDispute).toBe(true);
    // Withdrawing = completing, which triggers wallet credit
    expect(triggersWalletCredit('shipped', 'completed')).toBe(true);
  });
});

// ─── Full seller journey state machine ────────────────────────

describe('seller journey — state machine', () => {
  test('seller can only ship once order is paid', () => {
    expect(getOrderActions('paid', false, true).canShip).toBe(true);
    expect(getOrderActions('created', false, true).canShip).toBe(false);
    expect(getOrderActions('shipped', false, true).canShip).toBe(false);
  });

  test('shipping moves item price into pending balance', () => {
    expect(triggersWalletPending('paid', 'shipped')).toBe(true);
  });

  test('seller has no actions once shipped — waiting on buyer', () => {
    const actions = getOrderActions('shipped', false, true);
    expect(actions.canShip).toBe(false);
    expect(actions.canConfirm).toBe(false);
    expect(actions.canDispute).toBe(false);
    expect(actions.canCancel).toBe(false);
  });

  test('seller receives credit when order completes', () => {
    expect(triggersWalletCredit('shipped', 'completed')).toBe(true);
    expect(isTerminalStatus('completed')).toBe(true);
  });

  test('seller cannot cancel after shipping', () => {
    expect(getOrderActions('shipped', false, true).canCancel).toBe(false);
    expect(getOrderActions('completed', false, true).canCancel).toBe(false);
  });
});
