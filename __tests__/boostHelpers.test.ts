import { isBoostActive } from '../utils/boostHelpers';

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h from now
const past   = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
const now    = new Date();

describe('isBoostActive', () => {
  it('returns true when is_boosted and expires_at is in the future', () => {
    expect(isBoostActive({ is_boosted: true, boost_expires_at: future }, now)).toBe(true);
  });

  it('returns false when expires_at is in the past (stale flag)', () => {
    expect(isBoostActive({ is_boosted: true, boost_expires_at: past }, now)).toBe(false);
  });

  it('returns false when is_boosted is false', () => {
    expect(isBoostActive({ is_boosted: false, boost_expires_at: future }, now)).toBe(false);
  });

  it('returns false when boost_expires_at is null', () => {
    expect(isBoostActive({ is_boosted: true, boost_expires_at: null }, now)).toBe(false);
  });

  it('returns false when both is_boosted is false and expires_at is null', () => {
    expect(isBoostActive({ is_boosted: false, boost_expires_at: null }, now)).toBe(false);
  });
});
