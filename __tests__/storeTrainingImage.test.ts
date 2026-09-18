// store-training-image — the Fit photo + confirmed-label recorder.
//
// Two guarantees: the allow-lists can't drift from constants/theme.ts (or a
// taxonomy change would silently start rejecting every upload), and a photo
// with a person in it is refused no matter what else is in the request.
import { Categories, Colours, Occasions } from '../constants/theme';
import {
  MAX_BASE64_LENGTH,
  TAXONOMY_VERSION,
  VALID_CATEGORIES,
  VALID_COLOURS,
  VALID_OCCASIONS,
  validateSubmission,
} from '../supabase/functions/store-training-image/_lib';

describe('allow-lists mirror the theme', () => {
  test('categories', () => {
    expect([...VALID_CATEGORIES].sort()).toEqual(Categories.filter(c => c !== 'All').sort());
  });
  test('colours', () => {
    expect([...VALID_COLOURS].sort()).toEqual([...Colours].sort());
  });
  test('occasions', () => {
    expect([...VALID_OCCASIONS].sort()).toEqual([...Occasions].sort());
  });
  test('taxonomy version is the 2026-09 refresh', () => {
    expect(TAXONOMY_VERSION).toBe(2);
  });
});

describe('validateSubmission', () => {
  const good = {
    imageBase64: 'data:image/jpeg;base64,/9j/abc',
    category: 'Lehenga',
    gender: 'Women',
    colour: 'Maroon',
    occasion: 'Wedding',
    fabricWeight: 'Heavy',
    hasPerson: false,
    predicted: { category: 'Gown', colour: 'Red', confidence: 0.82, engine: 'rekognition', engineVersion: 'v1' },
  };

  test('accepts a full submission and strips the data-URL prefix', () => {
    const r = validateSubmission(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imageBase64).toBe('/9j/abc');
    expect(r.row).toEqual({
      source: 'fit',
      category: 'Lehenga',
      gender: 'Women',
      colour: 'Maroon',
      occasion: 'Wedding',
      fabric_weight: 'Heavy',
      predicted_category: 'Gown',
      predicted_colour: 'Red',
      predicted_confidence: 0.82,
      predicted_engine: 'rekognition',
      predicted_engine_version: 'v1',
      taxonomy_version: 2,
      has_person: false,
    });
  });

  test('refuses a photo with a person in it, however it is spelled', () => {
    for (const hasPerson of [true, 'true', '1']) {
      expect(validateSubmission({ ...good, hasPerson })).toEqual({ ok: false, reason: 'person' });
    }
  });

  test('refuses a missing or oversized image', () => {
    expect(validateSubmission({ ...good, imageBase64: undefined })).toEqual({ ok: false, reason: 'no_image' });
    expect(validateSubmission({ ...good, imageBase64: 'x'.repeat(MAX_BASE64_LENGTH + 1) })).toEqual({ ok: false, reason: 'too_large' });
  });

  test('refuses a category outside the list', () => {
    expect(validateSubmission({ ...good, category: 'Partywear' })).toEqual({ ok: false, reason: 'bad_category' });
    expect(validateSubmission({ ...good, category: 'All' })).toEqual({ ok: false, reason: 'bad_category' });
  });

  test('a wrong optional value becomes null rather than losing the photo', () => {
    const r = validateSubmission({ ...good, colour: 'Beige', occasion: 'Partywear', gender: 'Kids', fabricWeight: 'Medium' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.colour).toBeNull();
    expect(r.row.occasion).toBeNull();
    expect(r.row.gender).toBeNull();
    expect(r.row.fabric_weight).toBeNull();
    expect(r.row.category).toBe('Lehenga');
  });

  test('an out-of-range or missing confidence becomes null', () => {
    const r1 = validateSubmission({ ...good, predicted: { ...good.predicted, confidence: 1.4 } });
    const r2 = validateSubmission({ ...good, predicted: undefined });
    expect(r1.ok && r1.row.predicted_confidence).toBeNull();
    expect(r2.ok && r2.row.predicted_category).toBeNull();
  });

  test('the old client body (image + category only) still works', () => {
    const r = validateSubmission({ imageBase64: 'abc', category: 'Kurta' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.category).toBe('Kurta');
    expect(r.row.predicted_engine).toBeNull();
  });
});
