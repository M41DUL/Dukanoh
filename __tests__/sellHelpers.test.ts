import {
  validateListing,
  buildMeasurements,
  isCategoryValidForGender,
  isFormDirty,
  ListingForm,
  Measurements,
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

const emptyMeasurements: Measurements = { chest: '', waist: '', length: '' };

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
      const errors = validateListing(validForm, emptyMeasurements, 1, false);
      expect(errors).toEqual({});
    });

    test('requires at least one image', () => {
      const errors = validateListing(validForm, emptyMeasurements, 0, false);
      expect(errors.images).toBe('Add at least one photo');
    });

    test('requires title', () => {
      const errors = validateListing({ ...validForm, title: '' }, emptyMeasurements, 1, false);
      expect(errors.title).toBe('Title is required');
    });

    test('requires title to be at least 3 characters', () => {
      const errors = validateListing({ ...validForm, title: 'ab' }, emptyMeasurements, 1, false);
      expect(errors.title).toBe('Title must be at least 3 characters');
    });

    test('trims title before checking length', () => {
      const errors = validateListing({ ...validForm, title: '  ab  ' }, emptyMeasurements, 1, false);
      expect(errors.title).toBe('Title must be at least 3 characters');
    });

    test('requires description', () => {
      const errors = validateListing({ ...validForm, description: '' }, emptyMeasurements, 1, false);
      expect(errors.description).toBe('Description is required');
    });

    test('requires description to be at least 10 characters', () => {
      const errors = validateListing({ ...validForm, description: 'Short' }, emptyMeasurements, 1, false);
      expect(errors.description).toBe('Description must be at least 10 characters');
    });

    test('requires price of at least £1', () => {
      const errors = validateListing({ ...validForm, price: '0.50' }, emptyMeasurements, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects empty price', () => {
      const errors = validateListing({ ...validForm, price: '' }, emptyMeasurements, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects non-numeric price', () => {
      const errors = validateListing({ ...validForm, price: 'abc' }, emptyMeasurements, 1, false);
      expect(errors.price).toBe('Enter a price of at least £1');
    });

    test('rejects price above £2,000', () => {
      const errors = validateListing({ ...validForm, price: '2001' }, emptyMeasurements, 1, false);
      expect(errors.price).toBe('Maximum price is £2,000');
    });

    test('accepts price at boundaries (£1 and £2000)', () => {
      expect(validateListing({ ...validForm, price: '1' }, emptyMeasurements, 1, false).price).toBeUndefined();
      expect(validateListing({ ...validForm, price: '2000' }, emptyMeasurements, 1, false).price).toBeUndefined();
    });

    test('requires gender', () => {
      const errors = validateListing({ ...validForm, gender: '' }, emptyMeasurements, 1, false);
      expect(errors.gender).toBe('Select a gender');
    });

    test('requires category', () => {
      const errors = validateListing({ ...validForm, category: '' }, emptyMeasurements, 1, false);
      expect(errors.category).toBe('Select a category');
    });

    test('requires condition', () => {
      const errors = validateListing({ ...validForm, condition: '' }, emptyMeasurements, 1, false);
      expect(errors.condition).toBe('Select a condition');
    });

    test('requires size', () => {
      const errors = validateListing({ ...validForm, size: '' }, emptyMeasurements, 1, false);
      expect(errors.size).toBe('Select a size');
    });

    test('returns multiple errors at once', () => {
      const errors = validateListing(emptyForm, emptyMeasurements, 0, false);
      expect(Object.keys(errors).length).toBeGreaterThan(3);
    });
  });

  describe('draft mode (isDraft = true)', () => {
    test('only requires title for drafts', () => {
      const form = { ...emptyForm, title: 'My draft' };
      const errors = validateListing(form, emptyMeasurements, 0, true);
      expect(errors).toEqual({});
    });

    test('still validates title in draft mode', () => {
      const errors = validateListing(emptyForm, emptyMeasurements, 0, true);
      expect(errors.title).toBe('Title is required');
    });

    test('does not require images in draft mode', () => {
      const form = { ...emptyForm, title: 'Draft' };
      const errors = validateListing(form, emptyMeasurements, 0, true);
      expect(errors.images).toBeUndefined();
    });

    test('does not require description, price, gender, category, condition, size in draft', () => {
      const form = { ...emptyForm, title: 'Draft listing' };
      const errors = validateListing(form, emptyMeasurements, 0, true);
      expect(errors.description).toBeUndefined();
      expect(errors.price).toBeUndefined();
      expect(errors.gender).toBeUndefined();
      expect(errors.category).toBeUndefined();
      expect(errors.condition).toBeUndefined();
      expect(errors.size).toBeUndefined();
    });
  });

  describe('measurements validation', () => {
    test('skips empty measurements', () => {
      const errors = validateListing(validForm, emptyMeasurements, 1, false);
      expect(errors).toEqual({});
    });

    test('accepts valid measurements', () => {
      const errors = validateListing(validForm, { chest: '38', waist: '32', length: '44' }, 1, false);
      expect(errors).toEqual({});
    });

    test('rejects measurement below 1', () => {
      const errors = validateListing(validForm, { chest: '0', waist: '', length: '' }, 1, false);
      expect((errors as any).chest).toBe('Must be 1–99');
    });

    test('rejects measurement above 99', () => {
      const errors = validateListing(validForm, { chest: '', waist: '100', length: '' }, 1, false);
      expect((errors as any).waist).toBe('Must be 1–99');
    });

    test('rejects non-numeric measurement', () => {
      const errors = validateListing(validForm, { chest: '', waist: '', length: 'abc' }, 1, false);
      expect((errors as any).length).toBe('Must be 1–99');
    });

    test('accepts boundary values (1 and 99)', () => {
      const errors = validateListing(validForm, { chest: '1', waist: '99', length: '' }, 1, false);
      expect((errors as any).chest).toBeUndefined();
      expect((errors as any).waist).toBeUndefined();
    });

    test('validates measurements even in draft mode', () => {
      const form = { ...emptyForm, title: 'Draft' };
      const errors = validateListing(form, { chest: '0', waist: '', length: '' }, 0, true);
      expect((errors as any).chest).toBe('Must be 1–99');
    });
  });
});

// ─── buildMeasurements ─────────────────────────────────────

describe('buildMeasurements', () => {
  test('returns null for empty measurements', () => {
    expect(buildMeasurements(emptyMeasurements)).toBeNull();
  });

  test('returns object with valid measurements', () => {
    expect(buildMeasurements({ chest: '38', waist: '32', length: '44' }))
      .toEqual({ chest: 38, waist: 32, length: 44 });
  });

  test('omits empty fields', () => {
    expect(buildMeasurements({ chest: '38', waist: '', length: '' }))
      .toEqual({ chest: 38 });
  });

  test('omits zero values', () => {
    expect(buildMeasurements({ chest: '0', waist: '32', length: '' }))
      .toEqual({ waist: 32 });
  });

  test('omits negative values', () => {
    expect(buildMeasurements({ chest: '-5', waist: '', length: '44' }))
      .toEqual({ length: 44 });
  });

  test('omits non-numeric values', () => {
    expect(buildMeasurements({ chest: 'abc', waist: '32', length: '' }))
      .toEqual({ waist: 32 });
  });

  test('returns null when all values are invalid', () => {
    expect(buildMeasurements({ chest: 'abc', waist: '0', length: '-1' })).toBeNull();
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
    expect(isFormDirty(emptyForm, emptyMeasurements, 0)).toBe(false);
  });

  test('returns true when title is filled', () => {
    expect(isFormDirty({ ...emptyForm, title: 'Test' }, emptyMeasurements, 0)).toBe(true);
  });

  test('returns true when description is filled', () => {
    expect(isFormDirty({ ...emptyForm, description: 'Desc' }, emptyMeasurements, 0)).toBe(true);
  });

  test('returns true when price is filled', () => {
    expect(isFormDirty({ ...emptyForm, price: '10' }, emptyMeasurements, 0)).toBe(true);
  });

  test('returns true when gender is selected', () => {
    expect(isFormDirty({ ...emptyForm, gender: 'Men' }, emptyMeasurements, 0)).toBe(true);
  });

  test('returns true when images are added', () => {
    expect(isFormDirty(emptyForm, emptyMeasurements, 1)).toBe(true);
  });

  test('returns true when measurements are filled', () => {
    expect(isFormDirty(emptyForm, { chest: '38', waist: '', length: '' }, 0)).toBe(true);
  });

  test('returns true when optional fields are filled', () => {
    expect(isFormDirty({ ...emptyForm, colour: 'Red' }, emptyMeasurements, 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, fabric: 'Silk' }, emptyMeasurements, 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, occasion: 'Eid' }, emptyMeasurements, 0)).toBe(true);
    expect(isFormDirty({ ...emptyForm, worn_at: 'Eid 2023' }, emptyMeasurements, 0)).toBe(true);
  });
});
