// What the seller did with each drafted field, scored without keeping any text.
import { anyDraftOffered, draftOutcome, draftOutcomes, wordOverlap } from '../lib/draftOutcome';

describe('draftOutcome', () => {
  test('no draft is none, whatever the seller typed', () => {
    expect(draftOutcome(null, 'Black kurta')).toBe('none');
    expect(draftOutcome(undefined, '')).toBe('none');
  });
  test('kept, cleared, edited, replaced', () => {
    expect(draftOutcome('Black kurta', ' Black kurta ')).toBe('kept');
    expect(draftOutcome('Black kurta', '')).toBe('cleared');
    expect(draftOutcome('Black kurta with side slits', 'Black kurta with side slits, worn once')).toBe('edited');
    expect(draftOutcome('Black kurta with side slits', 'Mens eid outfit')).toBe('replaced');
  });
  test('a single-value field is kept or replaced', () => {
    expect(draftOutcome('Cotton', 'Cotton')).toBe('kept');
    expect(draftOutcome('Cotton', 'Silk')).toBe('replaced');
    expect(draftOutcome('Cotton', '')).toBe('cleared');
  });
});

describe('wordOverlap', () => {
  test('is the share of the draft still present', () => {
    expect(wordOverlap('gold zari border', 'gold zari border and hem')).toBe(1);
    expect(wordOverlap('gold zari border', 'plain hem')).toBe(0);
    expect(wordOverlap('', 'anything')).toBe(0);
  });
});

describe('draftOutcomes', () => {
  const draft = { title: 'Black kurta', description: 'Plain black cotton, straight cut.', fabric: 'Cotton', occasion: null, engineVersion: 'v' };
  test('scores each field and knows when nothing was offered', () => {
    const o = draftOutcomes(draft, { title: 'Black kurta', description: 'Plain black cotton, straight cut. Worn twice.', fabric: 'Silk', occasion: 'Eid' });
    expect(o).toEqual({ title: 'kept', description: 'edited', fabric: 'replaced', occasion: 'none' });
    expect(anyDraftOffered(o)).toBe(true);
    expect(anyDraftOffered(draftOutcomes(null, { title: 'x', description: 'y', fabric: '', occasion: '' }))).toBe(false);
  });
});
