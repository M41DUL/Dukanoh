// Unit tests for pure logic in supabase/functions/validate-clothing/_lib.ts
import {
  isClothingLabel,
  detectCategory,
  detectColour,
} from '../supabase/functions/validate-clothing/_lib';

// ─── isClothingLabel ──────────────────────────────────────────────────────────

describe('isClothingLabel', () => {
  test('recognises root clothing labels', () => {
    for (const name of ['Clothing', 'Apparel', 'Fashion', 'Textile', 'Fabric']) {
      expect(isClothingLabel({ Name: name, Confidence: 90 })).toBe(true);
    }
  });

  test('recognises South Asian garment root labels', () => {
    for (const name of ['Saree', 'Sari', 'Lehenga', 'Kurta', 'Dupatta', 'Silk', 'Lace']) {
      expect(isClothingLabel({ Name: name, Confidence: 90 })).toBe(true);
    }
  });

  test('recognises child label whose parent is Clothing', () => {
    expect(isClothingLabel({
      Name: 'T-Shirt',
      Confidence: 85,
      Parents: [{ Name: 'Clothing' }],
    })).toBe(true);
  });

  test('recognises child label whose parent is Apparel', () => {
    expect(isClothingLabel({
      Name: 'Jeans',
      Confidence: 85,
      Parents: [{ Name: 'Apparel' }],
    })).toBe(true);
  });

  test('recognises label with multiple parents where one is Clothing', () => {
    expect(isClothingLabel({
      Name: 'Dress',
      Confidence: 90,
      Parents: [{ Name: 'Fashion' }, { Name: 'Clothing' }],
    })).toBe(true);
  });

  test('returns false for non-clothing label with no parents', () => {
    expect(isClothingLabel({ Name: 'Person', Confidence: 99 })).toBe(false);
  });

  test('returns false when parent is unrelated', () => {
    expect(isClothingLabel({
      Name: 'Shoe',
      Confidence: 90,
      Parents: [{ Name: 'Footwear' }],
    })).toBe(false);
  });

  test('returns false when Parents is an empty array', () => {
    expect(isClothingLabel({ Name: 'Bag', Confidence: 90, Parents: [] })).toBe(false);
  });

  test('returns false when Parents is undefined', () => {
    expect(isClothingLabel({ Name: 'Chair', Confidence: 90, Parents: undefined })).toBe(false);
  });
});

// ─── detectCategory ───────────────────────────────────────────────────────────

describe('detectCategory', () => {
  test('maps Saree → Saree', () => {
    expect(detectCategory(['Saree', 'Clothing'])).toBe('Saree');
  });

  test('maps Sari → Saree (alternate spelling)', () => {
    expect(detectCategory(['Sari'])).toBe('Saree');
  });

  test('maps Lehenga → Lehenga', () => {
    expect(detectCategory(['Lehenga'])).toBe('Lehenga');
  });

  test('maps Lehnga → Lehenga (typo variant)', () => {
    expect(detectCategory(['Lehnga'])).toBe('Lehenga');
  });

  test('maps Gown → Lehenga', () => {
    expect(detectCategory(['Gown'])).toBe('Lehenga');
  });

  test('maps Dress → Lehenga', () => {
    expect(detectCategory(['Dress'])).toBe('Lehenga');
  });

  test('maps Skirt → Lehenga', () => {
    expect(detectCategory(['Skirt'])).toBe('Lehenga');
  });

  test('maps Scarf → Dupatta', () => {
    expect(detectCategory(['Scarf'])).toBe('Dupatta');
  });

  test('maps Shawl → Dupatta', () => {
    expect(detectCategory(['Shawl'])).toBe('Dupatta');
  });

  test('maps Veil → Dupatta', () => {
    expect(detectCategory(['Veil'])).toBe('Dupatta');
  });

  test('maps Shirt → Kurta', () => {
    expect(detectCategory(['Shirt'])).toBe('Kurta');
  });

  test('maps Top → Kurta', () => {
    expect(detectCategory(['Top'])).toBe('Kurta');
  });

  test('maps Tunic → Kurta', () => {
    expect(detectCategory(['Tunic'])).toBe('Kurta');
  });

  test('maps Suit → Sherwani', () => {
    expect(detectCategory(['Suit'])).toBe('Sherwani');
  });

  test('maps Tuxedo → Sherwani', () => {
    expect(detectCategory(['Tuxedo'])).toBe('Sherwani');
  });

  test('maps Jacket → Nehru Jacket', () => {
    expect(detectCategory(['Jacket'])).toBe('Nehru Jacket');
  });

  test('maps Blazer → Nehru Jacket', () => {
    expect(detectCategory(['Blazer'])).toBe('Nehru Jacket');
  });

  test('maps Pants → Salwar', () => {
    expect(detectCategory(['Pants'])).toBe('Salwar');
  });

  test('maps Trousers → Salwar', () => {
    expect(detectCategory(['Trousers'])).toBe('Salwar');
  });

  test('returns null for unrecognised labels', () => {
    expect(detectCategory(['Person', 'Indoors', 'Furniture'])).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(detectCategory([])).toBeNull();
  });

  test('first match in priority order wins (Lehenga before Dress)', () => {
    // Lehenga appears before Dress in LABEL_TO_CATEGORY
    expect(detectCategory(['Dress', 'Lehenga'])).toBe('Lehenga');
  });
});

// ─── detectColour ─────────────────────────────────────────────────────────────

describe('detectColour', () => {
  const cases: [string, string][] = [
    ['red',    'Red'],
    ['pink',   'Pink'],
    ['orange', 'Other'],
    ['yellow', 'Gold'],
    ['green',  'Green'],
    ['blue',   'Blue'],
    ['purple', 'Other'],
    ['white',  'White'],
    ['black',  'Black'],
    ['grey',   'Other'],
    ['gray',   'Other'],
    ['brown',  'Beige'],
    ['beige',  'Beige'],
    ['gold',   'Gold'],
    ['maroon', 'Maroon'],
  ];

  test.each(cases)('maps %s → %s', (input, expected) => {
    expect(detectColour([{ SimplifiedColor: input }])).toBe(expected);
  });

  test('is case-insensitive (uppercase)', () => {
    expect(detectColour([{ SimplifiedColor: 'RED' }])).toBe('Red');
  });

  test('is case-insensitive (mixed case)', () => {
    expect(detectColour([{ SimplifiedColor: 'Gold' }])).toBe('Gold');
  });

  test('returns first matching colour from array', () => {
    expect(detectColour([
      { SimplifiedColor: 'red' },
      { SimplifiedColor: 'blue' },
    ])).toBe('Red');
  });

  test('skips entry with no SimplifiedColor and uses next', () => {
    expect(detectColour([
      { PixelPercent: 40 },
      { SimplifiedColor: 'blue' },
    ])).toBe('Blue');
  });

  test('returns null for empty array', () => {
    expect(detectColour([])).toBeNull();
  });

  test('returns null when no colour matches', () => {
    expect(detectColour([{ SimplifiedColor: 'ultraviolet' }])).toBeNull();
  });
});
