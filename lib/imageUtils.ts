import * as ImageManipulator from 'expo-image-manipulator';

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
