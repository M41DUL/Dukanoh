import * as ImageManipulator from 'expo-image-manipulator';

// ── Supabase image transformation ────────────────────────────
//
// Supabase Storage supports on-the-fly image resizing via query params.
// Use these presets to serve the right size for each context — full-res
// is only loaded when the user explicitly zooms in on the detail screen.

export type ImageSize = 'thumbnail' | 'card' | 'detail' | 'avatar' | 'full';

const SIZE_PARAMS: Record<ImageSize, string> = {
  thumbnail: 'width=200&quality=70', // Stories bubbles, small previews
  card:      'width=400&quality=75', // ListingCard grid + featured
  detail:    'width=900&quality=80', // Listing detail carousel
  avatar:    'width=100&quality=75', // Avatars everywhere
  full:      '',                     // Zoom view — no transform, original file
};

/**
 * Extract the file path within a Supabase storage bucket from a public URL.
 * Returns null for non-storage or local URIs (e.g. file:// from ImagePicker).
 */
export function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

/**
 * Append Supabase image transform params to a storage URL.
 * Non-Supabase URLs (local assets, external) are returned unchanged.
 */
export function getImageUrl(url: string | null | undefined, size: ImageSize): string {
  if (!url) return '';
  // Only transform Supabase storage URLs
  if (!url.includes('/storage/v1/object/public/')) return url;
  const params = SIZE_PARAMS[size];
  if (!params) return url;
  // Preserve any existing query string (shouldn't happen, but be safe)
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params}`;
}

const MAX_DIMENSION = 1080;

/**
 * Resize an image to max 1080px on its longest side and compress to JPEG.
 * Returns the URI of the compressed image.
 */
export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Compress an image to 800px wide for Rekognition analysis.
 * Returns base64-encoded JPEG (without data URL prefix).
 */
export async function compressImageForAnalysis(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const raw = result.base64 ?? '';
  return raw.includes(',') ? raw.split(',')[1] : raw;
}
