// eslint-disable-next-line import/no-unresolved
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Clothing detection labels ───────────────────────────────────────────────

const CLOTHING_LABELS = new Set([
  'Clothing', 'Apparel', 'Dress', 'Gown', 'Shirt', 'Blouse',
  'Skirt', 'Pants', 'Coat', 'Jacket', 'Suit', 'Robe', 'Costume',
  'Fashion', 'Saree', 'Sari', 'Scarf', 'Shawl', 'Textile', 'Fabric',
  'Silk', 'Lace', 'Sleeve', 'Collar', 'Lehenga', 'Kurta', 'Dupatta',
]);

// ─── Label → app category mapping ───────────────────────────────────────────
// Priority order — first match wins

const LABEL_TO_CATEGORY: [string, string][] = [
  ['Lehenga',      'Lehenga'],
  ['Lehnga',       'Lehenga'],
  ['Saree',        'Saree'],
  ['Sari',         'Saree'],
  ['Anarkali',     'Anarkali'],
  ['Sherwani',     'Sherwani'],
  ['Dupatta',      'Dupatta'],
  ['Scarf',        'Dupatta'],
  ['Shawl',        'Dupatta'],
  ['Veil',         'Dupatta'],
  ['Blouse',       'Blouse'],
  ['Kurta',        'Kurta'],
  ['Shirt',        'Kurta'],
  ['Top',          'Kurta'],
  ['Tunic',        'Kurta'],
  ['Gown',         'Lehenga'],
  ['Dress',        'Lehenga'],
  ['Skirt',        'Lehenga'],
  ['Suit',         'Sherwani'],
  ['Tuxedo',       'Sherwani'],
  ['Jacket',       'Nehru Jacket'],
  ['Blazer',       'Nehru Jacket'],
  ['Pants',        'Salwar'],
  ['Trousers',     'Salwar'],
];

// ─── Rekognition SimplifiedColor → app colour mapping ───────────────────────

const SIMPLIFIED_TO_COLOUR: Record<string, string> = {
  red:    'Red',
  pink:   'Pink',
  orange: 'Other',
  yellow: 'Gold',
  green:  'Green',
  blue:   'Blue',
  purple: 'Other',
  white:  'White',
  black:  'Black',
  grey:   'Other',
  gray:   'Other',
  brown:  'Beige',
  beige:  'Beige',
  gold:   'Gold',
  maroon: 'Maroon',
};

function detectCategory(labels: string[]): string | null {
  const labelSet = new Set(labels);
  for (const [rekLabel, appCategory] of LABEL_TO_CATEGORY) {
    if (labelSet.has(rekLabel)) return appCategory;
  }
  return null;
}

function detectColour(dominantColors: { SimplifiedColor?: string; PixelPercent?: number }[]): string | null {
  // Use the most dominant colour (already sorted by PixelPercent desc by Rekognition)
  for (const c of dominantColors) {
    const simplified = c.SimplifiedColor?.toLowerCase();
    if (simplified && SIMPLIFIED_TO_COLOUR[simplified]) {
      return SIMPLIFIED_TO_COLOUR[simplified];
    }
  }
  return null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const region = Deno.env.get('AWS_REGION')!;

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region,
      service: 'rekognition',
    });

    const response = await aws.fetch(
      `https://rekognition.${region}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'RekognitionService.DetectLabels',
        },
        body: JSON.stringify({
          Image: { Bytes: imageBase64 },
          MaxLabels: 20,
          MinConfidence: 70,
          // IMAGE_PROPERTIES returns dominant colours with SimplifiedColor
          Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      // eslint-disable-next-line no-console
      console.error('Rekognition error:', error);
      return new Response(
        JSON.stringify({ error: 'Image validation failed' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const labels: string[] = data.Labels?.map((l: { Name: string }) => l.Name) ?? [];
    const dominantColors = data.ImageProperties?.DominantColors ?? [];

    const isClothing = labels.some(l => CLOTHING_LABELS.has(l));
    const detectedCategory = detectCategory(labels);
    const detectedColour = detectColour(dominantColors);

    return new Response(
      JSON.stringify({ isClothing, detectedCategory, detectedColour, labels }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('validate-clothing error:', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
