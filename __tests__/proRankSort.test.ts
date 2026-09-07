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

  test('the diversity cap limits PROMOTED slots, not adjacency', () => {
    // Documented behaviour, worth pinning: `rest` preserves input order, so a
    // seller's skipped listing can still sit next to their promoted one when
    // it came next in the input. The cap bounds promotion, not clustering.
    const input = [
      row('x1', 'founder', { seller: 'same' }),
      row('x2', 'founder', { seller: 'same' }),
      row('a', 'free'), row('b', 'free'),
      row('c', 'free'), row('d', 'free'),
      row('e', 'free'), row('f', 'free'),
    ];
    const out = ids(proRankSort(input));
    expect(out[0]).toBe('x1');
    expect(out[1]).toBe('x2'); // adjacent, but x2 was never *promoted*
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
