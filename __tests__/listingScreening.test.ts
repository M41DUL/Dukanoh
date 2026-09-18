// The sell form's one-look-per-batch screening: batches merge back in order,
// a failed batch passes its photos through, and the cover read comes from
// the first batch only.
import { BATCH_SIZE, chunk, mergeBatches, normaliseCoverRead, normalisePhotoScreen, passThroughPhoto } from '../lib/listingScreeningHelpers';

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
});
