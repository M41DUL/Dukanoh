import {
  validateListing,
  buildMeasurements,
  isCategoryValidForGender,
  isFormDirty,
  ListingForm,
} from '../lib/sellHelpers';
import {
  Genders,
  CategoriesByGender,
  Conditions,
  Occasions,
  Sizes,
  Colours,
  Fabrics,
} from '../constants/theme';

// ─── Test helpers ──────────────────────────────────────────

const emptyForm: ListingForm = {
  title: '', description: '', price: '', gender: '', category: '',
  condition: '', occasion: '', size: '', colour: '', fabric: '', worn_at: '',
};

const validForm: ListingForm = {
  title: 'Embroidered silk kurta',
  description: 'Beautiful kurta worn once at Eid',
  price: '45',
  gender: 'Men',
  category: 'Kurta',
  condition: 'Excellent',
  occasion: 'Eid',
  size: 'M',
  colour: 'Gold',
  fabric: 'Silk',
  worn_at: 'Eid 2023',
};

// ─── Theme constants ───────────────────────────────────────

describe('Sell form constants', () => {
  test('Genders has Men and Women', () => {
    expect(Genders).toEqual(['Men', 'Women']);
  });

  test('every gender has at least one category', () => {
    Genders.forEach(g => {
      expect(CategoriesByGender[g].length).toBeGreaterThan(0);
    });
  });

  test('CategoriesByGender values are non-empty string arrays', () => {
    Object.values(CategoriesByGender).forEach(cats => {
      cats.forEach(c => expect(typeof c).toBe('string'));
    });
  });

  test('Conditions has expected values', () => {
    expect(Conditions).toEqual(['New', 'Excellent', 'Good', 'Fair']);
  });

  test('Sizes includes Custom', () => {
    expect(Sizes).toContain('Custom');
  });

  test('Colours has at least 5 options', () => {
    expect(Colours.length).toBeGreaterThanOrEqual(5);
  });

  test('Fabrics has at least 5 options', () => {
    expect(Fabrics.length).toBeGreaterThanOrEqual(5);
  });

  test('Occasions has at least 3 options', () => {
    expect(Occasions.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── validateListing ───────────────────────────────────────

describe('validateListing', () => {
  describe('publish mode (isDraft = false)', () => {
    test('returns no errors for a complete valid form', () => {
      const errors = validateListing(validForm, 1, false);
      expect(errors).toEqual({});
    });

    test('requires at least one image', () => {
      const errors = validateListing(validForm, 0, false);
      expect(errors.images).toBe('Add at least one photo');
    });

    test('requires title', () => {
      const errors = validateListing({ ...validForm, title: '' }, 1, false);
      expect(errors.title).toBe('Title is required');
    });

    test('requires title to be at least 3 characters', () => {
      const errors = validateListing({ ...validForm, title: 'ab' }, 1, false);
      expect(errors.title).toBe('Title must be at least 3 characters');
    });

    test('trims title before checking length', () => {
      const errors = validateListing({ ...validForm, title: '  ab  ' }, 1, false);
      expect(errors.title).toBe('Title must be at least 3 characters');
    });

    test('requires description', () => {
      const errors = validateListing({ ...validForm, description: '' }, 1, false);
      expect(errors.description).toBe('Description is required');
    });

    test('requires description to be at least 10 characters', () => {
      const errors = validateListing({ ...validForm, description: 'Short' }, 1, false);
      expect(errors.description).toBe('Description must be at least 10 characters');
    });

    test('requires price of at least £1', () => {
      const errors = validateListing({ ...validForm, price: '0.50' }, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects empty price', () => {
      const errors = validateListing({ ...validForm, price: '' }, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects non-numeric price', () => {
      const errors = validateListing({ ...validForm, price: 'abc' }, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects price above £2,000', () => {
      const errors = validateListing({ ...validForm, price: '2001' }, 1, false);
      expect(errors.price).toBe('Maximum price is £2,000');
    });

    test('accepts price at boundaries (£1 and £2000)', () => {
      expect(validateListing({ ...validForm, price: '1' }, 1, false).price).toBeUndefined();
      expect(validateListing({ ...validForm, price: '2000' }, 1, false).price).toBeUndefined();
    });

    test('does not require gender (auto-inferred for most categories)', () => {
      const errors = validateListing({ ...validForm, gender: '' }, 1, false);
      expect(errors.gender).toBeUndefined();
    });

    test('requires category', () => {
      const errors = validateListing({ ...validForm, category: '' }, 1, false);
      expect(errors.category).toBe('Select a category');
    });

    test('requires condition', () => {
      const errors = validateListing({ ...validForm, condition: '' }, 1, false);
      expect(errors.condition).toBe('Select a condition');
    });

    test('requires size', () => {
      const errors = validateListing({ ...validForm, size: '' }, 1, false);
      expect(errors.size).toBe('Select a size');
    });

    test('returns multiple errors at once', () => {
      const errors = validateListing(emptyForm, 0, false);
      expect(Object.keys(errors).length).toBeGreaterThan(3);
    });
  });

  describe('draft mode (isDraft = true)', () => {
    test('only requires title for drafts', () => {
      const form = { ...emptyForm, title: 'My draft' };
      const errors = validateListing(form, 0, true);
      expect(errors).toEqual({});
    });

    test('still validates title in draft mode', () => {
      const errors = validateListing(emptyForm, 0, true);
      expect(errors.title).toBe('Title is required');
    });

    test('does not require images in draft mode', () => {
      const form = { ...emptyForm, title: 'Draft' };
      const errors = validateListing(form, 0, true);
      expect(errors.images).toBeUndefined();
    });

    test('does not require description, price, gender, category, condition, size in draft', () => {
      const form = { ...emptyForm, title: 'Draft listing' };
      const errors = validateListing(form, 0, true);
      expect(errors.description).toBeUndefined();
      expect(errors.price).toBeUndefined();
      expect(errors.gender).toBeUndefined();
      expect(errors.category).toBeUndefined();
      expect(errors.condition).toBeUndefined();
      expect(errors.size).toBeUndefined();
    });
  });
});

// ─── buildMeasurements ─────────────────────────────────────

describe('buildMeasurements', () => {
  test('returns null for empty string', () => {
    expect(buildMeasurements('')).toBeNull();
  });

  test('returns null for whitespace-only string', () => {
    expect(buildMeasurements('   ')).toBeNull();
  });

  test('returns note object for non-empty string', () => {
    expect(buildMeasurements('Waist 28", length 42"')).toEqual({ note: 'Waist 28", length 42"' });
  });

  test('trims the note', () => {
    expect(buildMeasurements('  Chest 38"  ')).toEqual({ note: 'Chest 38"' });
  });
});

// ─── isCategoryValidForGender ──────────────────────────────

describe('isCategoryValidForGender', () => {
  test('Kurta is valid for Men', () => {
    expect(isCategoryValidForGender('Kurta', 'Men')).toBe(true);
  });

  test('Kurta is valid for Women', () => {
    expect(isCategoryValidForGender('Kurta', 'Women')).toBe(true);
  });

  test('Lehenga is valid for Women only', () => {
    expect(isCategoryValidForGender('Lehenga', 'Women')).toBe(true);
    expect(isCategoryValidForGender('Lehenga', 'Men')).toBe(false);
  });

  test('Sherwani is valid for Men only', () => {
    expect(isCategoryValidForGender('Sherwani', 'Men')).toBe(true);
    expect(isCategoryValidForGender('Sherwani', 'Women')).toBe(false);
  });

  test('returns false for invalid gender', () => {
    expect(isCategoryValidForGender('Kurta', 'Other')).toBe(false);
  });

  test('returns false for empty gender', () => {
    expect(isCategoryValidForGender('Kurta', '')).toBe(false);
  });

  test('returns false for non-existent category', () => {
    expect(isCategoryValidForGender('Nonexistent', 'Men')).toBe(false);
  });
});

// ─── isFormDirty ───────────────────────────────────────────

describe('isFormDirty', () => {
  test('returns false for empty form with no images', () => {
    expect(isFormDirty(emptyForm, '', 0)).toBe(false);
  });

  test('returns true when title is filled', () => {
    expect(isFormDirty({ ...emptyForm, title: 'Test' }, '', 0)).toBe(true);
  });

  test('returns true when description is filled', () => {
    expect(isFormDirty({ ...emptyForm, description: 'Desc' }, '', 0)).toBe(true);
  });

  test('returns true when price is filled', () => {
    expect(isFormDirty({ ...emptyForm, price: '10' }, '', 0)).toBe(true);
  });

  test('returns true when gender is selected', () => {
    expect(isFormDirty({ ...emptyForm, gender: 'Men' }, '', 0)).toBe(true);
  });

  test('returns true when images are added', () => {
    expect(isFormDirty(emptyForm, '', 1)).toBe(true);
  });

  test('returns true when measurements note is filled', () => {
    expect(isFormDirty(emptyForm, 'Waist 28"', 0)).toBe(true);
  });

  test('returns true when optional fields are filled', () => {
    expect(isFormDirty({ ...emptyForm, colour: 'Red' }, '', 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, fabric: 'Silk' }, '', 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, occasion: 'Eid' }, '', 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, worn_at: 'Eid 2023' }, '', 0)).toBe(true);
  });
});
