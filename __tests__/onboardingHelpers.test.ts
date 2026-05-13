import {
  ONBOARDING_CATEGORIES,
  getSubtitleText,
  toggleCategory,
} from '../constants/onboardingHelpers';

// ─── ONBOARDING_CATEGORIES ──────────────────────────────────

describe('ONBOARDING_CATEGORIES', () => {
  test('excludes "All" from the list', () => {
    expect(ONBOARDING_CATEGORIES).not.toContain('All');
  });

  test('includes expected categories', () => {
    const expected = [
      'Lehenga', 'Saree', 'Anarkali', 'Sherwani', 'Kurta',
      'Achkan', 'Pathani Suit', 'Casualwear', 'Shoes',
    ];
    expected.forEach((cat) => {
      expect(ONBOARDING_CATEGORIES).toContain(cat);
    });
  });
});

// ─── getSubtitleText ────────────────────────────────────────

describe('getSubtitleText', () => {
  test('returns "Pick at least one to continue" for 0 selected', () => {
    expect(getSubtitleText(0)).toBe('Pick at least one to continue');
  });

  test('returns count for 1 selected', () => {
    expect(getSubtitleText(1)).toBe('1 selected');
  });

  test('returns count for 2 selected', () => {
    expect(getSubtitleText(2)).toBe('2 selected');
  });

  test('returns "nice taste!" for 3+ selected', () => {
    expect(getSubtitleText(3)).toContain('3 selected');
    expect(getSubtitleText(3)).toContain('nice taste!');
  });

  test('returns "nice taste!" for 5 selected', () => {
    expect(getSubtitleText(5)).toContain('5 selected');
    expect(getSubtitleText(5)).toContain('nice taste!');
  });

  test('returns "nice taste!" for all 10 selected', () => {
    expect(getSubtitleText(10)).toContain('10 selected');
    expect(getSubtitleText(10)).toContain('nice taste!');
  });
});

// ─── toggleCategory ─────────────────────────────────────────

describe('toggleCategory', () => {
  test('adds a category that is not selected', () => {
    const result = toggleCategory([], 'Men');
    expect(result).toEqual(['Men']);
  });

  test('removes a category that is already selected', () => {
    const result = toggleCategory(['Men', 'Women'], 'Men');
    expect(result).toEqual(['Women']);
  });

  test('preserves order of other categories when removing', () => {
    const result = toggleCategory(['Men', 'Women', 'Festive'], 'Women');
    expect(result).toEqual(['Men', 'Festive']);
  });

  test('appends new category at the end', () => {
    const result = toggleCategory(['Men'], 'Women');
    expect(result).toEqual(['Men', 'Women']);
  });

  test('does not mutate the original array', () => {
    const original = ['Men', 'Women'];
    const copy = [...original];
    toggleCategory(original, 'Festive');
    expect(original).toEqual(copy);
  });

  test('toggling twice returns to original state', () => {
    const original = ['Men', 'Women'];
    const afterAdd = toggleCategory(original, 'Festive');
    const afterRemove = toggleCategory(afterAdd, 'Festive');
    expect(afterRemove).toEqual(original);
  });

  test('handles empty array correctly for removal (no-op)', () => {
    const result = toggleCategory([], 'Men');
    const result2 = toggleCategory(result, 'Men');
    expect(result2).toEqual([]);
  });
});
