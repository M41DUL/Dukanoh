import {
  calcProtectionFee,
  calcOrderTotal,
  DEFAULT_FEE_PERCENT,
  DEFAULT_FEE_FLAT,
} from '../lib/paymentHelpers';

// ─── Default constants ─────────────────────────────────────────

describe('default fee constants', () => {
  test('DEFAULT_FEE_PERCENT is 6.5', () => {
    expect(DEFAULT_FEE_PERCENT).toBe(6.5);
  });

  test('DEFAULT_FEE_FLAT is 0.80', () => {
    expect(DEFAULT_FEE_FLAT).toBe(0.8);
  });

  test('calcProtectionFee with no params matches explicit defaults', () => {
    const price = 45;
    expect(calcProtectionFee(price)).toBe(
      calcProtectionFee(price, DEFAULT_FEE_PERCENT, DEFAULT_FEE_FLAT)
    );
  });

  test('calcOrderTotal with no params matches explicit defaults', () => {
    const price = 100;
    expect(calcOrderTotal(price)).toBe(
      calcOrderTotal(price, DEFAULT_FEE_PERCENT, DEFAULT_FEE_FLAT)
    );
  });
});

// ─── Custom fee config (as read from platform_settings) ────────

describe('calcProtectionFee with custom fee config', () => {
  test('uses custom percent correctly', () => {
    // 100 * 0.05 + 0.80 = 5.80
    expect(calcProtectionFee(100, 5, 0.8)).toBe(5.8);
  });

  test('uses custom flat fee correctly', () => {
    // 100 * 0.065 + 1.00 = 7.50
    expect(calcProtectionFee(100, 6.5, 1.0)).toBe(7.5);
  });

  test('uses both custom percent and flat fee', () => {
    // 50 * 0.10 + 0.50 = 5.50
    expect(calcProtectionFee(50, 10, 0.5)).toBe(5.5);
  });

  test('rounds to 2 decimal places with custom config', () => {
    const fee = calcProtectionFee(33, 7, 0.75);
    const decimalPlaces = (fee.toString().split('.')[1] ?? '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  test('zero percent still applies flat fee', () => {
    expect(calcProtectionFee(100, 0, 0.5)).toBe(0.5);
  });
});

describe('calcOrderTotal with custom fee config', () => {
  test('total equals item price plus custom fee', () => {
    const price = 80;
    const feePercent = 5;
    const feeFlat = 1.0;
    expect(calcOrderTotal(price, feePercent, feeFlat)).toBe(
      price + calcProtectionFee(price, feePercent, feeFlat)
    );
  });

  test('total with 10% fee and £0.50 flat on £100 item', () => {
    // fee: 100 * 0.10 + 0.50 = 10.50 → total: 110.50
    expect(calcOrderTotal(100, 10, 0.5)).toBe(110.5);
  });

  test('total is always greater than item price with any positive fee', () => {
    [1, 50, 200].forEach(price => {
      expect(calcOrderTotal(price, 3, 0.5)).toBeGreaterThan(price);
    });
  });

  test('higher fee percent produces higher total', () => {
    const price = 50;
    expect(calcOrderTotal(price, 10, 0.8)).toBeGreaterThan(
      calcOrderTotal(price, 5, 0.8)
    );
  });

  test('higher flat fee produces higher total', () => {
    const price = 50;
    expect(calcOrderTotal(price, 6.5, 2.0)).toBeGreaterThan(
      calcOrderTotal(price, 6.5, 0.8)
    );
  });
});

// ─── Fee consistency: client and server use same formula ────────

describe('fee formula consistency', () => {
  test('pence-based calculation matches pounds-based for standard config', () => {
    const itemPricePence = 4500; // £45
    const feePercent = DEFAULT_FEE_PERCENT;
    const feeFlatPence = Math.round(DEFAULT_FEE_FLAT * 100); // 80p

    // Simulate edge function calculation (pence)
    const feePence = Math.round(itemPricePence * (feePercent / 100) + feeFlatPence);

    // Client helper calculation (pounds)
    const feeClient = calcProtectionFee(45, feePercent, DEFAULT_FEE_FLAT);

    expect(feePence).toBe(Math.round(feeClient * 100));
  });

  test('pence-based total matches pounds-based total', () => {
    const itemPricePence = 10000; // £100
    const feePercent = DEFAULT_FEE_PERCENT;
    const feeFlatPence = Math.round(DEFAULT_FEE_FLAT * 100);

    const feePence = Math.round(itemPricePence * (feePercent / 100) + feeFlatPence);
    const totalPence = itemPricePence + feePence;

    const totalClient = calcOrderTotal(100, feePercent, DEFAULT_FEE_FLAT);

    expect(totalPence).toBe(Math.round(totalClient * 100));
  });
});
