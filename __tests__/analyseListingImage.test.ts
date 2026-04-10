// Unit tests for pure logic in supabase/functions/analyse-listing-image/_lib.ts
import {
  isBlocked,
  hasComplexBackground,
} from '../supabase/functions/analyse-listing-image/_lib';

// ─── isBlocked ────────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  test('blocks Explicit Nudity by name at high confidence', () => {
    expect(isBlocked({ Name: 'Explicit Nudity', Confidence: 90 })).toBe(true);
  });

  test('blocks Graphic Violence by name at high confidence', () => {
    expect(isBlocked({ Name: 'Graphic Violence', Confidence: 75 })).toBe(true);
  });

  test('blocks child label whose parent is Explicit Nudity', () => {
    expect(isBlocked({ Name: 'Nudity', ParentName: 'Explicit Nudity', Confidence: 80 })).toBe(true);
  });

  test('does NOT block Suggestive — avoids false positives on South Asian garments', () => {
    expect(isBlocked({ Name: 'Suggestive', Confidence: 90 })).toBe(false);
  });

  test('does NOT block below confidence threshold of 70', () => {
    expect(isBlocked({ Name: 'Explicit Nudity', Confidence: 69 })).toBe(false);
  });

  test('does NOT block at 69.9 confidence', () => {
    expect(isBlocked({ Name: 'Explicit Nudity', Confidence: 69.9 })).toBe(false);
  });

  test('blocks at exactly 70 confidence', () => {
    expect(isBlocked({ Name: 'Explicit Nudity', Confidence: 70 })).toBe(true);
  });

  test('does NOT block an unrelated label', () => {
    expect(isBlocked({ Name: 'Clothing', Confidence: 99 })).toBe(false);
  });

  test('does NOT block a child of an unrelated parent', () => {
    expect(isBlocked({ Name: 'Swimwear', ParentName: 'Clothing', Confidence: 95 })).toBe(false);
  });
});

// ─── hasComplexBackground ─────────────────────────────────────────────────────

describe('hasComplexBackground', () => {
  test('returns false for empty labels', () => {
    expect(hasComplexBackground([])).toBe(false);
  });

  test('returns false for fewer than 3 background labels', () => {
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 90 },
      { Name: 'Furniture', Confidence: 80 },
    ])).toBe(false);
  });

  test('returns true for exactly 3 background labels', () => {
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 90 },
      { Name: 'Furniture', Confidence: 80 },
      { Name: 'Floor', Confidence: 75 },
    ])).toBe(true);
  });

  test('ignores background labels below 70 confidence', () => {
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 90 },
      { Name: 'Furniture', Confidence: 80 },
      { Name: 'Floor', Confidence: 69 },
    ])).toBe(false);
  });

  test('counts background labels at exactly 70 confidence', () => {
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 70 },
      { Name: 'Furniture', Confidence: 70 },
      { Name: 'Floor', Confidence: 70 },
    ])).toBe(true);
  });

  test('ignores non-background labels regardless of confidence', () => {
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 90 },
      { Name: 'Clothing', Confidence: 99 },
      { Name: 'Person', Confidence: 99 },
    ])).toBe(false);
  });

  test('mixed labels: counts only qualifying background labels', () => {
    // Room + Sofa + Lamp qualify; Clothing is not a background label; Bed is below threshold
    expect(hasComplexBackground([
      { Name: 'Room', Confidence: 95 },
      { Name: 'Sofa', Confidence: 85 },
      { Name: 'Lamp', Confidence: 75 },
      { Name: 'Clothing', Confidence: 99 },
      { Name: 'Bed', Confidence: 65 },
    ])).toBe(true);
  });
});
