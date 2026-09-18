// The one-line read on the Fit confirmation card, and the note above results.
import { buildFitSummary, categoryInSentence, missingSearchNote } from '../utils/fitSummary';

describe('buildFitSummary', () => {
  test('colour, category and accents read as one line', () => {
    const s = buildFitSummary({ category: 'Anarkali', colour: 'Maroon', accentColours: ['Gold'], embellishment: 'heavy', gender: 'Women', missing: ['dupatta'] });
    expect(s.headline).toBe('Maroon anarkali with gold');
    expect(s.detail).toBe('Heavy embroidery · For women');
    expect(s.missingLine).toBe("Missing a dupatta — we'll look for one first.");
  });
  test('two accents and two missing pieces join naturally', () => {
    const s = buildFitSummary({ category: 'Lehenga', colour: 'Red', accentColours: ['Gold', 'Cream'], missing: ['blouse', 'dupatta'] });
    expect(s.headline).toBe('Red lehenga with gold and cream');
    expect(s.missingLine).toBe("Missing a blouse and a dupatta — we'll look for those first.");
  });
  test('proper nouns keep their capital mid-sentence', () => {
    expect(categoryInSentence('Nehru Jacket')).toBe('Nehru jacket');
    expect(categoryInSentence('Pathani Suit')).toBe('Pathani suit');
    expect(categoryInSentence('Salwar Kameez')).toBe('salwar kameez');
  });
  test('Multi and Other colours read sensibly', () => {
    expect(buildFitSummary({ category: 'Saree', colour: 'Multi' }).headline).toBe('Multicoloured saree');
    expect(buildFitSummary({ category: 'Saree', colour: 'Other' }).headline).toBe('Saree');
  });
  test('nothing missing, nothing embellished, no gender → bare headline', () => {
    const s = buildFitSummary({ category: 'Kurta', colour: 'Black', embellishment: 'none', missing: [] });
    expect(s.detail).toBe('');
    expect(s.missingLine).toBeNull();
  });
  test('Other accent colours are dropped', () => {
    expect(buildFitSummary({ category: 'Kurta', colour: 'Black', accentColours: ['Other'] }).headline).toBe('Black kurta');
  });
});

describe('missingSearchNote', () => {
  test('names what the search leads with', () => {
    expect(missingSearchNote(['dupatta'])).toBe('Looking for a dupatta first.');
    expect(missingSearchNote(['bottoms', 'jacket'])).toBe('Looking for bottoms and a jacket first.');
    expect(missingSearchNote([])).toBeNull();
    expect(missingSearchNote(null)).toBeNull();
  });
});
