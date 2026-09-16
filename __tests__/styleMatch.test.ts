// Dukanoh Fit matching rules — utils/styleMatch.ts
//
// Guards the maps against drifting from constants/theme.ts (a category or
// colour Fit doesn't know about silently produces empty results) and pins
// the scoring tiers and gender / neutral-colour rules the docs describe.
import { Categories, CategoriesByGender, Colours, Fabrics } from '../constants/theme';
import {
  COLOUR_MAP,
  COMPLEMENTARY_CATEGORIES,
  MIN_STRICT_RESULTS,
  fabricToWeight,
  getCompatibleColours,
  getComplementaryCategories,
  inferGenderForCategory,
  isColourCompatible,
  isNeutralBaseColour,
  scoreMatch,
} from '../utils/styleMatch';

const FIT_CATEGORIES = Categories.filter(c => !['All', 'Casualwear', 'Shoes'].includes(c));
const NEUTRAL_BASES = ['Beige', 'White', 'Other'];
const NON_NEUTRAL_COLOURS = Colours.filter(c => !NEUTRAL_BASES.includes(c));
const ALL_CATEGORIES: readonly string[] = Categories;
const ALL_COLOURS: readonly string[] = Colours;

// ─── Complementary categories ────────────────────────────────────────────────

describe('complementary categories', () => {
  test('every Fit category has at least one suggestion', () => {
    for (const c of FIT_CATEGORIES) {
      expect(getComplementaryCategories(c).length).toBeGreaterThan(0);
    }
  });

  test('suggestions are real categories and never the base itself', () => {
    for (const [base, suggestions] of Object.entries(COMPLEMENTARY_CATEGORIES)) {
      expect(ALL_CATEGORIES).toContain(base);
      for (const s of suggestions) {
        expect(ALL_CATEGORIES).toContain(s);
        expect(s).not.toBe(base);
      }
    }
  });

  test('an unknown category yields no suggestions', () => {
    expect(getComplementaryCategories('Shoes')).toEqual([]);
    expect(getComplementaryCategories('')).toEqual([]);
  });
});

// ─── Colour compatibility ────────────────────────────────────────────────────

describe('colour compatibility', () => {
  test('every colour in the theme has a map entry', () => {
    for (const c of Colours) expect(COLOUR_MAP[c]).toBeDefined();
  });

  test('mapped colours are real colours', () => {
    for (const { primary, secondary } of Object.values(COLOUR_MAP)) {
      for (const c of [...primary, ...secondary]) expect(ALL_COLOURS).toContain(c);
    }
  });

  test('neutral bases apply no filter and accept every candidate, even unknown', () => {
    for (const base of NEUTRAL_BASES) {
      expect(isNeutralBaseColour(base)).toBe(true);
      expect(isColourCompatible(base, 'Other')).toBe(true);
      expect(isColourCompatible(base, null)).toBe(true);
      expect(isColourCompatible(base, 'Red')).toBe(true);
    }
  });

  test('Beige and White pair with every non-neutral base', () => {
    for (const base of NON_NEUTRAL_COLOURS) {
      expect(isNeutralBaseColour(base)).toBe(false);
      expect(isColourCompatible(base, 'Beige')).toBe(true);
      expect(isColourCompatible(base, 'White')).toBe(true);
    }
  });

  test('a neutral the map already ranks as primary stays primary', () => {
    const black = getCompatibleColours('Black');
    expect(black.primary).toContain('White');
    expect(black.secondary).not.toContain('White');
  });

  test('a neutral the map omits is added as secondary, not primary', () => {
    const red = getCompatibleColours('Red');
    expect(red.primary).not.toContain('White');
    expect(red.secondary).toContain('White');
  });

  test('an unset or Other candidate colour is never a strict match against a non-neutral base', () => {
    expect(isColourCompatible('Red', 'Other')).toBe(false);
    expect(isColourCompatible('Red', null)).toBe(false);
    expect(isColourCompatible('Red', undefined)).toBe(false);
    expect(isColourCompatible('Red', '')).toBe(false);
  });

  test('a clashing colour is rejected', () => {
    expect(isColourCompatible('Red', 'Blue')).toBe(false);
    expect(isColourCompatible('Green', 'Red')).toBe(false);
  });

  test('widen threshold is a small positive number', () => {
    expect(MIN_STRICT_RESULTS).toBeGreaterThan(0);
    expect(MIN_STRICT_RESULTS).toBeLessThanOrEqual(20);
  });
});

// ─── Fabric weight ───────────────────────────────────────────────────────────

describe('fabricToWeight', () => {
  test('every theme fabric except Other has a weight', () => {
    for (const f of Fabrics) {
      const w = fabricToWeight(f);
      if (f === 'Other') expect(w).toBeUndefined();
      else expect(['Light', 'Structured', 'Heavy']).toContain(w);
    }
  });

  test('an unset fabric has no weight', () => {
    expect(fabricToWeight(null)).toBeUndefined();
    expect(fabricToWeight(undefined)).toBeUndefined();
    expect(fabricToWeight('')).toBeUndefined();
    expect(fabricToWeight('Denim')).toBeUndefined();
  });
});

// ─── Gender ──────────────────────────────────────────────────────────────────

describe('inferGenderForCategory', () => {
  test('single-gender categories resolve', () => {
    expect(inferGenderForCategory('Lehenga')).toBe('Women');
    expect(inferGenderForCategory('Dupatta')).toBe('Women');
    expect(inferGenderForCategory('Sherwani')).toBe('Men');
    expect(inferGenderForCategory('Nehru Jacket')).toBe('Men');
  });

  test('categories listed under both genders are ambiguous', () => {
    expect(inferGenderForCategory('Kurta')).toBeNull();
    expect(inferGenderForCategory('Salwar')).toBeNull();
  });

  test('agrees with CategoriesByGender for every Fit category', () => {
    for (const c of FIT_CATEGORIES) {
      const women = CategoriesByGender.Women.includes(c);
      const men = CategoriesByGender.Men.includes(c);
      const expected = women && !men ? 'Women' : men && !women ? 'Men' : null;
      expect(inferGenderForCategory(c)).toBe(expected);
    }
  });
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

describe('scoreMatch', () => {
  const base = { category: 'Lehenga', colour: 'Red', occasion: 'Wedding', fabricWeight: 'Heavy' as const };

  test('a perfect match scores 7 (occasion 3 + primary colour 2 + fabric 1 + popularity 1)', () => {
    expect(scoreMatch(base, {
      category: 'Dupatta', colour: 'Gold', occasion: 'Wedding', fabricWeight: 'Heavy', save_count: 5,
    })).toBe(7);
  });

  test('a secondary colour scores 1, and White counts as secondary for Red', () => {
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red' }, { category: 'Dupatta', colour: 'Pink' })).toBe(1);
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red' }, { category: 'Dupatta', colour: 'White' })).toBe(1);
  });

  test('a clashing colour scores nothing', () => {
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red' }, { category: 'Dupatta', colour: 'Blue' })).toBe(0);
  });

  test('an incompatible fabric weight adds nothing', () => {
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red', fabricWeight: 'Heavy' }, {
      category: 'Dupatta', colour: 'Gold', fabricWeight: 'Light',
    })).toBe(2);
  });

  test('the popularity boost needs at least 5 saves', () => {
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red' }, { category: 'Dupatta', save_count: 4 })).toBe(0);
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red' }, { category: 'Dupatta', save_count: 5 })).toBe(1);
  });

  test('occasion only counts on an exact match', () => {
    expect(scoreMatch({ category: 'Lehenga', colour: 'Red', occasion: 'Wedding' }, {
      category: 'Dupatta', occasion: 'Party',
    })).toBe(0);
  });
});
