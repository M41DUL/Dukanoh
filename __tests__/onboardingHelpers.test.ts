import {
  ONBOARDING_CATEGORIES,
  CATEGORY_LAYOUT,
  CATEGORY_DISTANCES,
  MAX_DIST,
  BASE_WIDTH,
  computeDistances,
  getEntranceDelay,
  getScaledSize,
  getActiveBubbleSize,
  getSubtitleText,
  toggleCategory,
} from '../constants/onboardingHelpers';

// ─── ONBOARDING_CATEGORIES ──────────────────────────────────

describe('ONBOARDING_CATEGORIES', () => {
  test('excludes "All" from the list', () => {
    expect(ONBOARDING_CATEGORIES).not.toContain('All');
  });

  test('has exactly 9 categories', () => {
    expect(ONBOARDING_CATEGORIES).toHaveLength(9);
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

// ─── CATEGORY_LAYOUT ────────────────────────────────────────

describe('CATEGORY_LAYOUT', () => {
  test('has one layout entry per category', () => {
    expect(CATEGORY_LAYOUT).toHaveLength(ONBOARDING_CATEGORIES.length);
  });

  test('all left values are between 0 and 1', () => {
    CATEGORY_LAYOUT.forEach((l) => {
      expect(l.left).toBeGreaterThanOrEqual(0);
      expect(l.left).toBeLessThan(1);
    });
  });

  test('all top values are between 0 and 1', () => {
    CATEGORY_LAYOUT.forEach((l) => {
      expect(l.top).toBeGreaterThanOrEqual(0);
      expect(l.top).toBeLessThan(1);
    });
  });

  test('all sizes are positive', () => {
    CATEGORY_LAYOUT.forEach((l) => {
      expect(l.size).toBeGreaterThan(0);
    });
  });

  test('sizes are within a reasonable range (50–150px base)', () => {
    CATEGORY_LAYOUT.forEach((l) => {
      expect(l.size).toBeGreaterThanOrEqual(50);
      expect(l.size).toBeLessThanOrEqual(150);
    });
  });
});

// ─── computeDistances / CATEGORY_DISTANCES ──────────────────

describe('computeDistances', () => {
  test('returns one distance per layout entry', () => {
    expect(CATEGORY_DISTANCES).toHaveLength(CATEGORY_LAYOUT.length);
  });

  test('all distances are non-negative', () => {
    CATEGORY_DISTANCES.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(0);
    });
  });

  test('MAX_DIST is the largest distance', () => {
    CATEGORY_DISTANCES.forEach((d) => {
      expect(d).toBeLessThanOrEqual(MAX_DIST);
    });
  });

  test('returns 0 for a point at the centre', () => {
    const distances = computeDistances(
      [{ left: 0.5, top: 0.5, size: 80 }],
      { x: 0.5, y: 0.5 },
    );
    expect(distances[0]).toBe(0);
  });

  test('computes correct Euclidean distance', () => {
    const distances = computeDistances(
      [{ left: 0.3, top: 0.4, size: 80 }],
      { x: 0, y: 0 },
    );
    // sqrt(0.3^2 + 0.4^2) = sqrt(0.09 + 0.16) = sqrt(0.25) = 0.5
    expect(distances[0]).toBeCloseTo(0.5);
  });
});

// ─── getEntranceDelay ───────────────────────────────────────

describe('getEntranceDelay', () => {
  test('returns a value between 200ms and 1000ms', () => {
    for (let i = 0; i < ONBOARDING_CATEGORIES.length; i++) {
      const delay = getEntranceDelay(i);
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  test('bubble closest to centre has the smallest delay', () => {
    const delays = ONBOARDING_CATEGORIES.map((_, i) => getEntranceDelay(i));
    const minDelay = Math.min(...delays);
    const minIndex = delays.indexOf(minDelay);
    // The closest bubble should also have the smallest distance
    const minDistIndex = CATEGORY_DISTANCES.indexOf(Math.min(...CATEGORY_DISTANCES));
    expect(minIndex).toBe(minDistIndex);
  });

  test('bubble farthest from centre has the largest delay (1000ms)', () => {
    const delays = ONBOARDING_CATEGORIES.map((_, i) => getEntranceDelay(i));
    const maxDelay = Math.max(...delays);
    expect(maxDelay).toBe(1000);
  });
});

// ─── getScaledSize ──────────────────────────────────────────

describe('getScaledSize', () => {
  test('returns base size on baseline device (390px)', () => {
    expect(getScaledSize(100, BASE_WIDTH)).toBe(100);
  });

  test('scales up on larger screens', () => {
    const result = getScaledSize(100, 430);
    expect(result).toBeGreaterThan(100);
    expect(result).toBeCloseTo(100 * (430 / 390));
  });

  test('scales down on smaller screens', () => {
    const result = getScaledSize(100, 320);
    expect(result).toBeLessThan(100);
    expect(result).toBeCloseTo(100 * (320 / 390));
  });

  test('returns 0 for size 0', () => {
    expect(getScaledSize(0, 390)).toBe(0);
  });
});

// ─── getActiveBubbleSize ────────────────────────────────────

describe('getActiveBubbleSize', () => {
  test('inactive bubble returns base scaled size', () => {
    const result = getActiveBubbleSize(100, BASE_WIDTH, false);
    expect(result).toBe(100);
  });

  test('active bubble is 6% larger than inactive', () => {
    const inactive = getActiveBubbleSize(100, BASE_WIDTH, false);
    const active = getActiveBubbleSize(100, BASE_WIDTH, true);
    expect(active).toBeCloseTo(inactive * 1.06);
  });

  test('scaling and active multiplier stack correctly', () => {
    const result = getActiveBubbleSize(100, 430, true);
    expect(result).toBeCloseTo(100 * (430 / 390) * 1.06);
  });
});

// ─── getSubtitleText ────────────────────────────────────────

describe('getSubtitleText', () => {
  test('returns "Pick at least one" for 0 selected', () => {
    expect(getSubtitleText(0)).toBe('Pick at least one');
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
