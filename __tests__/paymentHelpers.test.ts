import {
  calcProtectionFee,
  calcOrderTotal,
  calcSellerPayout,
  formatGBP,
} from '../lib/paymentHelpers';

// ─── calcProtectionFee ─────────────────────────────────────────

describe('calcProtectionFee', () => {
  test('calculates fee for a typical price (£45)', () => {
    // 45 * 0.065 + 0.80 = 2.925 + 0.80 = 3.725 → rounds to 3.73
    expect(calcProtectionFee(45)).toBe(3.73);
  });

  test('calculates fee for a low price (£5)', () => {
    // 5 * 0.065 + 0.80 = 0.325 + 0.80 = 1.125 → rounds to 1.13
    expect(calcProtectionFee(5)).toBe(1.13);
  });

  test('calculates fee for a high price (£500)', () => {
    // 500 * 0.065 + 0.80 = 32.5 + 0.80 = 33.30
    expect(calcProtectionFee(500)).toBe(33.3);
  });

  test('calculates fee for max price (£2000)', () => {
    // 2000 * 0.065 + 0.80 = 130 + 0.80 = 130.80
    expect(calcProtectionFee(2000)).toBe(130.8);
  });

  test('calculates fee for minimum price (£1)', () => {
    // 1 * 0.065 + 0.80 = 0.065 + 0.80 = 0.865 → rounds to 0.87
    expect(calcProtectionFee(1)).toBe(0.87);
  });

  test('returns a value rounded to exactly 2 decimal places', () => {
    const fee = calcProtectionFee(33);
    const decimalPlaces = (fee.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  test('fee is always greater than £0.80 (flat minimum)', () => {
    expect(calcProtectionFee(1)).toBeGreaterThan(0.8);
    expect(calcProtectionFee(100)).toBeGreaterThan(0.8);
  });

  test('fee scales with price', () => {
    expect(calcProtectionFee(100)).toBeGreaterThan(calcProtectionFee(50));
    expect(calcProtectionFee(50)).toBeGreaterThan(calcProtectionFee(10));
  });
});

// ─── calcOrderTotal ────────────────────────────────────────────

describe('calcOrderTotal', () => {
  test('total equals item price plus protection fee', () => {
    const price = 45;
    expect(calcOrderTotal(price)).toBe(price + calcProtectionFee(price));
  });

  test('total is always greater than the item price', () => {
    [1, 10, 50, 100, 500, 2000].forEach(price => {
      expect(calcOrderTotal(price)).toBeGreaterThan(price);
    });
  });

  test('total for £45 is correct', () => {
    // item: 45 + fee: 3.73 = 48.73
    expect(calcOrderTotal(45)).toBe(48.73);
  });

  test('total for £100 is correct', () => {
    // fee: 100 * 0.065 + 0.80 = 7.30
    expect(calcOrderTotal(100)).toBe(107.3);
  });

  test('rounds to 2 decimal places', () => {
    const total = calcOrderTotal(33);
    const decimalPlaces = (total.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

// ─── calcSellerPayout ──────────────────────────────────────────

describe('calcSellerPayout', () => {
  test('seller receives the full item price', () => {
    expect(calcSellerPayout(45)).toBe(45);
    expect(calcSellerPayout(100)).toBe(100);
  });

  test('seller payout is less than total paid by buyer', () => {
    const price = 75;
    expect(calcSellerPayout(price)).toBeLessThan(calcOrderTotal(price));
  });

  test('platform keeps the protection fee', () => {
    const price = 50;
    const platformRevenue = calcOrderTotal(price) - calcSellerPayout(price);
    expect(platformRevenue).toBeCloseTo(calcProtectionFee(price), 2);
  });
});

// ─── formatGBP ─────────────────────────────────────────────────

describe('formatGBP', () => {
  test('formats whole number', () => {
    expect(formatGBP(45)).toBe('£45.00');
  });

  test('formats decimal amount', () => {
    expect(formatGBP(3.73)).toBe('£3.73');
  });

  test('formats zero', () => {
    expect(formatGBP(0)).toBe('£0.00');
  });

  test('formats large amount', () => {
    expect(formatGBP(2000)).toBe('£2000.00');
  });

  test('always includes £ prefix', () => {
    expect(formatGBP(10).startsWith('£')).toBe(true);
  });

  test('always shows 2 decimal places', () => {
    expect(formatGBP(5)).toBe('£5.00');
    expect(formatGBP(5.1)).toBe('£5.10');
    expect(formatGBP(5.99)).toBe('£5.99');
  });
});
