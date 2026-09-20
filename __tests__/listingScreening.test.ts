// The sell form's one-look-per-batch screening: batches merge back in order,
// a failed batch passes its photos through, and the cover read comes from
// the first batch only.
import { BATCH_SIZE, chunk, mergeBatches, normaliseCoverRead, normaliseDraft, normalisePhotoScreen, passThroughPhoto } from '../lib/listingScreeningHelpers';

describe('chunk', () => {
  test('splits into batches of the configured size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8], BATCH_SIZE)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(chunk([1], BATCH_SIZE)).toEqual([[1]]);
    expect(chunk([], BATCH_SIZE)).toEqual([]);
  });
});

describe('normalisePhotoScreen', () => {
  test('ok means neither blocked nor rejected', () => {
    expect(normalisePhotoScreen({ blocked: false, isClothing: true, warnings: ['x'], reasons: [] }).ok).toBe(true);
    expect(normalisePhotoScreen({ blocked: true, reasons: ['nudity'] }).ok).toBe(false);
    expect(normalisePhotoScreen({ isClothing: false }).ok).toBe(false);
  });
  test('garbage passes through', () => {
    expect(normalisePhotoScreen(null)).toEqual(passThroughPhoto());
  });
});

describe('mergeBatches', () => {
  const server = (photos: object[], cover: object | null = null) => ({ photos, cover });

  test('keeps original order across batches and reads the cover from batch one', () => {
    const merged = mergeBatches([
      server([{ blocked: false, isClothing: true, warnings: ['dark'] }, { blocked: true, reasons: ['nudity'] }],
             { detectedCategory: 'Kurta', detectedColour: 'Black', detectedGender: 'Men', confidence: 0.8, attributes: { pieces: ['top'] } }),
      server([{ isClothing: false }], { detectedCategory: 'Saree' }),
    ], [2, 1]);
    expect(merged.photos.map(p => p.ok)).toEqual([true, false, false]);
    expect(merged.photos[0].warnings).toEqual(['dark']);
    expect(merged.photos[1].reasons).toEqual(['nudity']);
    expect(merged.cover?.detectedCategory).toBe('Kurta');
    expect(merged.cover?.detectedGender).toBe('Men');
  });

  test('a failed batch passes its photos through and pre-fills nothing', () => {
    const merged = mergeBatches([null, server([{ blocked: true }])], [4, 1]);
    expect(merged.photos).toHaveLength(5);
    expect(merged.photos.slice(0, 4).every(p => p.ok)).toBe(true);
    expect(merged.photos[4].blocked).toBe(true);
    expect(merged.cover).toBeNull();
  });

  test('a short server list pads with pass-through entries', () => {
    const merged = mergeBatches([server([{ blocked: true }])], [3]);
    expect(merged.photos.map(p => p.blocked)).toEqual([true, false, false]);
  });

  test('normaliseCoverRead drops empty strings', () => {
    expect(normaliseCoverRead({ detectedCategory: '', detectedColour: 'Red' })).toEqual({
      detectedCategory: null, detectedColour: 'Red', detectedGender: null, confidence: null, attributes: null,
    });
    expect(normaliseCoverRead(null)).toBeNull();
  });

  test('the draft comes from batch one, and a failed batch drafts nothing', () => {
    const draft = { title: 'Black kurta with side slits', description: 'Plain black cotton, straight cut.', fabric: 'Cotton', occasion: 'Everyday', engineVersion: 'recognise-2026-09d' };
    const merged = mergeBatches([{ photos: [{}], cover: { detectedCategory: 'Kurta' }, draft }, { photos: [{}], draft: { title: 'Other' } }], [1, 1]);
    expect(merged.draft).toEqual(draft);
    expect(mergeBatches([null], [2]).draft).toBeNull();
  });
});

describe('normaliseDraft', () => {
  test('keeps only values the form can hold', () => {
    expect(normaliseDraft({ title: ' Black kurta ', description: '', fabric: 'Denim', occasion: 'Eid', engineVersion: 'v' })).toEqual({
      title: 'Black kurta', description: null, fabric: null, occasion: 'Eid', engineVersion: 'v',
    });
  });
  test('an empty draft is null', () => {
    expect(normaliseDraft({ title: '', description: null, fabric: null, occasion: null })).toBeNull();
    expect(normaliseDraft(null)).toBeNull();
    expect(normaliseDraft('x')).toBeNull();
  });
});
