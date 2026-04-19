/* eslint-disable import/no-unresolved */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.19';
/* eslint-enable import/no-unresolved */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Clothing detection ───────────────────────────────────────────────────────

const CLOTHING_ROOT_LABELS = new Set([
  'Clothing', 'Apparel', 'Fashion', 'Textile', 'Fabric',
  'Silk', 'Lace', 'Saree', 'Sari', 'Lehenga', 'Kurta', 'Dupatta',
]);

interface RekognitionLabel {
  Name: string;
  Confidence: number;
  Parents?: { Name: string }[];
}

function isClothingLabel(label: RekognitionLabel): boolean {
  if (CLOTHING_ROOT_LABELS.has(label.Name)) return true;
  return label.Parents?.some(p => p.Name === 'Clothing' || p.Name === 'Apparel') ?? false;
}

const LABEL_TO_CATEGORY: [string, string][] = [
  ['Lehenga',   'Lehenga'],
  ['Lehnga',    'Lehenga'],
  ['Saree',     'Saree'],
  ['Sari',      'Saree'],
  ['Anarkali',  'Anarkali'],
  ['Sherwani',  'Sherwani'],
  ['Dupatta',   'Dupatta'],
  ['Scarf',     'Dupatta'],
  ['Shawl',     'Dupatta'],
  ['Veil',      'Dupatta'],
  ['Blouse',    'Blouse'],
  ['Kurta',     'Kurta'],
  ['Shirt',     'Kurta'],
  ['Top',       'Kurta'],
  ['Tunic',     'Kurta'],
  ['Gown',      'Lehenga'],
  ['Dress',     'Lehenga'],
  ['Skirt',     'Lehenga'],
  ['Suit',      'Sherwani'],
  ['Tuxedo',    'Sherwani'],
  ['Jacket',    'Nehru Jacket'],
  ['Blazer',    'Nehru Jacket'],
  ['Pants',     'Salwar'],
  ['Trousers',  'Salwar'],
];

function detectCategory(labels: string[]): string | null {
  const labelSet = new Set(labels);
  for (const [rekLabel, appCategory] of LABEL_TO_CATEGORY) {
    if (labelSet.has(rekLabel)) return appCategory;
  }
  return null;
}

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

function detectColour(dominantColors: { SimplifiedColor?: string }[]): string | null {
  for (const c of dominantColors) {
    const simplified = c.SimplifiedColor?.toLowerCase();
    if (simplified && SIMPLIFIED_TO_COLOUR[simplified]) return SIMPLIFIED_TO_COLOUR[simplified];
  }
  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  try {
    const { imageBase64: rawBase64 } = await req.json();

    if (!rawBase64 || typeof rawBase64 !== 'string') return json({ error: 'No image provided' }, 400);
    if (rawBase64.length > 2_500_000) return json({ error: 'Image too large' }, 400);

    const imageBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

    const region = Deno.env.get('AWS_REGION');
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    if (!region || !accessKeyId || !secretAccessKey) return json({ error: 'Server misconfigured' }, 500);

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: 'rekognition',
    });

    const response = await aws.fetch(`https://rekognition.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'RekognitionService.DetectLabels',
      },
      body: JSON.stringify({
        Image: { Bytes: imageBase64 },
        MaxLabels: 30,
        MinConfidence: 60,
        Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'],
      }),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('Rekognition error status:', response.status);
      return json({ isClothing: false });
    }

    const data = await response.json();
    const rawLabels: RekognitionLabel[] = data.Labels ?? [];
    const labels = rawLabels.map(l => l.Name);
    const dominantColors = data.ImageProperties?.DominantColors ?? [];

    return json({
      isClothing: rawLabels.some(isClothingLabel),
      detectedCategory: detectCategory(labels),
      detectedColour: detectColour(dominantColors),
    });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('validate-clothing error:', (err as Error).message);
    return json({ isClothing: false });
  }
});
