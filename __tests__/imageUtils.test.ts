import { getImageUrl } from '../lib/imageUtils';

// A real Supabase storage URL — the only kind that gets transformed
const BASE = 'https://xyz.supabase.co/storage/v1/object/public/listings/photo.jpg';

// ─── Null / empty inputs ───────────────────────────────────────

describe('getImageUrl — null/empty inputs', () => {
  test('returns empty string for null', () => {
    expect(getImageUrl(null, 'card')).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(getImageUrl(undefined, 'card')).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(getImageUrl('', 'card')).toBe('');
  });
});

// ─── Non-Supabase URLs ────────────────────────────────────────

describe('getImageUrl — non-Supabase URLs', () => {
  test('returns external https URL unchanged', () => {
    const url = 'https://example.com/photo.jpg';
    expect(getImageUrl(url, 'card')).toBe(url);
  });

  test('returns local file URI unchanged', () => {
    const url = 'file:///var/mobile/Containers/photo.jpg';
    expect(getImageUrl(url, 'thumbnail')).toBe(url);
  });

  test('returns data URI unchanged', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB';
    expect(getImageUrl(url, 'avatar')).toBe(url);
  });
});

// ─── Size variants ─────────────────────────────────────────────

describe('getImageUrl — size variants', () => {
  test('thumbnail: width=200, quality=70', () => {
    const result = getImageUrl(BASE, 'thumbnail');
    expect(result).toContain('width=200');
    expect(result).toContain('quality=70');
  });

  test('card: width=400, quality=75', () => {
    const result = getImageUrl(BASE, 'card');
    expect(result).toContain('width=400');
    expect(result).toContain('quality=75');
  });

  test('detail: width=900, quality=80', () => {
    const result = getImageUrl(BASE, 'detail');
    expect(result).toContain('width=900');
    expect(result).toContain('quality=80');
  });

  test('avatar: width=100, quality=75', () => {
    const result = getImageUrl(BASE, 'avatar');
    expect(result).toContain('width=100');
    expect(result).toContain('quality=75');
  });

  test('full: returns URL with no transform params appended', () => {
    const result = getImageUrl(BASE, 'full');
    expect(result).toBe(BASE);
  });
});

// ─── Query string handling ─────────────────────────────────────

describe('getImageUrl — query string handling', () => {
  test('uses ? separator on a clean URL', () => {
    const result = getImageUrl(BASE, 'card');
    expect(result).toMatch(/\?width=400/);
  });

  test('uses & separator when URL already has a query string', () => {
    const urlWithQuery = `${BASE}?token=abc`;
    const result = getImageUrl(urlWithQuery, 'card');
    expect(result).toContain('token=abc');
    expect(result).toContain('&width=400');
    expect(result).not.toMatch(/\?width=400/);
  });

  test('preserves the original base URL', () => {
    const result = getImageUrl(BASE, 'card');
    expect(result.startsWith(BASE)).toBe(true);
  });

  test('only one ? appears in the final URL', () => {
    const result = getImageUrl(BASE, 'card');
    expect((result.match(/\?/g) ?? []).length).toBe(1);
  });
});

// ─── All sizes produce a valid URL ────────────────────────────

describe('getImageUrl — all sizes produce valid output', () => {
  const sizes = ['thumbnail', 'card', 'detail', 'avatar', 'full'] as const;

  sizes.forEach(size => {
    test(`${size} returns a non-empty string`, () => {
      const result = getImageUrl(BASE, size);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test(`${size} result starts with the original URL`, () => {
      const result = getImageUrl(BASE, size);
      expect(result.startsWith(BASE)).toBe(true);
    });
  });
});
