// proRankSort — Pro ranking boost.
//
// The bug this guards against: the eligibility check compared
// `seller_tier === 'pro'` directly, so `founder` — a PAID tier — got no
// ranking boost at all. Founders paid for priority placement and silently
// received none.

import { proRankSort } from '../utils/proRankSort';

interface Row {
  id: string;
  seller_id?: string;
  seller?: { seller_tier?: string | null } | null;
  created_at?: string | null;
}

const recent = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const ancient = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

const row = (
  id: string,
  tier: string | null,
  opts: { seller?: string; created_at?: string } = {},
): Row => ({
  id,
  seller_id: opts.seller ?? `seller-${id}`,
  seller: tier === null ? null : { seller_tier: tier },
  created_at: opts.created_at ?? recent(),
});

const ids = (rows: Row[]) => rows.map(r => r.id);

describe('proRankSort — tier eligibility', () => {
  test('promotes a pro seller above free sellers', () => {
    const input = [row('a', 'free'), row('b', 'free'), row('c', 'free'), row('pro', 'pro')];
    expect(ids(proRankSort(input))[0]).toBe('pro');
  });

  test('promotes a FOUNDER seller — founder is a paid tier', () => {
    const input = [row('a', 'free'), row('b', 'free'), row('c', 'free'), row('founder', 'founder')];
    expect(ids(proRankSort(input))[0]).toBe('founder');
  });

  test('treats founder and pro identically', () => {
    const withPro = [row('a', 'free'), row('b', 'free'), row('c', 'free'), row('x', 'pro')];
    const withFounder = [row('a', 'free'), row('b', 'free'), row('c', 'free'), row('x', 'founder')];
    expect(ids(proRankSort(withPro))).toEqual(ids(proRankSort(withFounder)));
  });

  test('does not promote free sellers', () => {
    const input = [row('a', 'free'), row('b', 'free'), row('c', 'free'), row('d', 'free')];
    expect(ids(proRankSort(input))).toEqual(['a', 'b', 'c', 'd']);
  });

  test('tolerates a missing or null seller relation', () => {
    const input = [row('a', null), { id: 'b', seller_id: 's', created_at: recent() }];
    expect(() => proRankSort(input)).not.toThrow();
    expect(ids(proRankSort(input))).toEqual(['a', 'b']);
  });
});

describe('proRankSort — guardrails still hold for founders', () => {
  test('recency floor: a founder listing older than 30 days is not promoted', () => {
    const input = [
      row('a', 'free'),
      row('b', 'free'),
      row('c', 'free'),
      row('stale', 'founder', { created_at: ancient() }),
    ];
    expect(ids(proRankSort(input))).toEqual(['a', 'b', 'c', 'stale']);
  });

  test('dilution cap: at most floor(n * 0.25) promoted slots', () => {
    // 8 rows => cap 2, even though 4 founder listings qualify.
    const input = [
      row('f1', 'founder'), row('f2', 'founder'), row('f3', 'founder'), row('f4', 'founder'),
      row('a', 'free'), row('b', 'free'), row('c', 'free'), row('d', 'free'),
    ];
    const out = ids(proRankSort(input));
    expect(out.slice(0, 2)).toEqual(['f1', 'f2']);
    // Overflow founders drop back behind the free listings, not into slot 3.
    expect(out.slice(2, 6)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.slice(6)).toEqual(['f3', 'f4']);
  });

  test('seller diversity: a seller\'s 2nd listing is not promoted, it keeps its place in the tail', () => {
    const input = [
      row('x1', 'founder', { seller: 'same' }),
      row('a', 'free'), row('b', 'free'),
      row('c', 'free'), row('d', 'free'),
      row('e', 'free'), row('f', 'free'),
      row('x2', 'founder', { seller: 'same' }),
    ];
    // x1 takes the promoted slot; x2 is skipped and stays in its original
    // relative position among the non-promoted rows (i.e. last).
    expect(ids(proRankSort(input))).toEqual(['x1', 'a', 'b', 'c', 'd', 'e', 'f', 'x2']);
  });

  test('a seller listing several pieces in a row cannot take the top of the feed', () => {
    // Results arrive newest-first, so without deferral this seller's four
    // listings would occupy positions 0-3: one promoted, three clustered
    // behind it because `rest` preserved input order.
    const input = [
      row('x1', 'founder', { seller: 'same' }),
      row('x2', 'founder', { seller: 'same' }),
      row('x3', 'founder', { seller: 'same' }),
      row('x4', 'founder', { seller: 'same' }),
      row('a', 'free'), row('b', 'free'),
      row('c', 'free'), row('d', 'free'),
    ];
    expect(ids(proRankSort(input))).toEqual(
      ['x1', 'a', 'b', 'c', 'd', 'x2', 'x3', 'x4'],
    );
  });

  test('overflow Pro sellers still outrank a seller\'s repeat listings', () => {
    // 8 rows => cap 2. p1/p2 promote; p3 is a distinct seller who overflowed
    // the cap; x2 is p1's second listing. Overflow ranks above repeats.
    const input = [
      row('p1', 'pro', { seller: 's1' }),
      row('x2', 'pro', { seller: 's1' }),
      row('p2', 'pro', { seller: 's2' }),
      row('p3', 'pro', { seller: 's3' }),
      row('a', 'free'), row('b', 'free'),
      row('c', 'free'), row('d', 'free'),
    ];
    const out = ids(proRankSort(input));
    expect(out.slice(0, 2)).toEqual(['p1', 'p2']);
    expect(out.indexOf('p3')).toBeLessThan(out.indexOf('x2'));
  });

  test('mixed pro and founder sellers each get one slot', () => {
    const input = [
      row('p', 'pro'), row('f', 'founder'),
      row('a', 'free'), row('b', 'free'),
      row('c', 'free'), row('d', 'free'),
      row('e', 'free'), row('g', 'free'),
    ];
    expect(ids(proRankSort(input)).slice(0, 2)).toEqual(['p', 'f']);
  });

  test('returns the input untouched when empty', () => {
    expect(proRankSort([])).toEqual([]);
  });

  test('preserves every input row', () => {
    const input = [
      row('f1', 'founder'), row('p1', 'pro'), row('a', 'free'),
      row('stale', 'founder', { created_at: ancient() }),
    ];
    expect(ids(proRankSort(input)).sort()).toEqual(ids(input).sort());
  });
});
