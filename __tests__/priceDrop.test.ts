// Price Drop badge helpers.
//
// Guards the two ways this shipped broken: the badge fields were written by
// only one of the two price-edit paths, and the badge rendered on the
// timestamp alone — so a seller could drop a price, put it back up, and keep
// advertising a reduction that no longer existed.

import { priceDropPatch, showsPriceDrop, PRICE_DROP_WINDOW_DAYS } from '../lib/priceDrop';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('priceDropPatch', () => {
  test('a drop records the old price and stamps the time', () => {
    const patch = priceDropPatch(100, 80);
    expect(patch.original_price).toBe(100);
    expect(patch.price_dropped_at).not.toBeNull();
  });

  test('an increase clears both fields', () => {
    expect(priceDropPatch(80, 100)).toEqual({ original_price: null, price_dropped_at: null });
  });

  test('an unchanged price clears both fields', () => {
    expect(priceDropPatch(80, 80)).toEqual({ original_price: null, price_dropped_at: null });
  });

  test('raising a price after a drop clears the badge rather than leaving it stale', () => {
    const dropped = priceDropPatch(100, 80);
    expect(dropped.price_dropped_at).not.toBeNull();
    const restored = priceDropPatch(80, 120);
    expect(restored.price_dropped_at).toBeNull();
    expect(restored.original_price).toBeNull();
  });
});

describe('showsPriceDrop', () => {
  test('shows for a recent drop still below the original', () => {
    expect(showsPriceDrop({ price: 80, original_price: 100, price_dropped_at: daysAgo(1) })).toBe(true);
  });

  test('hides when the price has climbed back to the original', () => {
    expect(showsPriceDrop({ price: 100, original_price: 100, price_dropped_at: daysAgo(1) })).toBe(false);
  });

  test('hides when the price now exceeds the original', () => {
    // The bug: the label rendered on price_dropped_at alone, so this listing
    // advertised "↓ Price dropped" at a HIGHER price than before.
    expect(showsPriceDrop({ price: 150, original_price: 100, price_dropped_at: daysAgo(1) })).toBe(false);
  });

  test('hides once the drop falls outside the recency window', () => {
    expect(showsPriceDrop({
      price: 80, original_price: 100, price_dropped_at: daysAgo(PRICE_DROP_WINDOW_DAYS + 1),
    })).toBe(false);
  });

  test('still shows just inside the window', () => {
    expect(showsPriceDrop({
      price: 80, original_price: 100, price_dropped_at: daysAgo(PRICE_DROP_WINDOW_DAYS - 1),
    })).toBe(true);
  });

  test.each([
    ['no stamp', { price: 80, original_price: 100, price_dropped_at: null }],
    ['no original', { price: 80, original_price: null, price_dropped_at: daysAgo(1) }],
    ['neither', { price: 80 }],
    ['unparseable stamp', { price: 80, original_price: 100, price_dropped_at: 'not-a-date' }],
  ])('hides with %s', (_label, listing) => {
    expect(showsPriceDrop(listing)).toBe(false);
  });

  test('a patch produced by priceDropPatch renders immediately', () => {
    const patch = priceDropPatch(100, 80);
    expect(showsPriceDrop({ price: 80, ...patch })).toBe(true);
  });
});
