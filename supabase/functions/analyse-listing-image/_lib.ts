// Pure logic extracted from index.ts.
// No Deno or AWS dependencies — safe to import in Jest tests.

// ─── Moderation ───────────────────────────────────────────────────────────────

export const BLOCKED_MODERATION_PARENTS = new Set(['Explicit Nudity']);
export const BLOCKED_MODERATION_NAMES   = new Set(['Explicit Nudity', 'Graphic Violence']);

export interface ModerationLabel {
  Name: string;
  ParentName?: string;
  Confidence: number;
}

export function isBlocked(label: ModerationLabel): boolean {
  if (label.Confidence < 70) return false;
  if (BLOCKED_MODERATION_NAMES.has(label.Name)) return true;
  if (label.ParentName && BLOCKED_MODERATION_PARENTS.has(label.ParentName)) return true;
  return false;
}

// ─── Background complexity ────────────────────────────────────────────────────

export const BACKGROUND_LABELS = new Set([
  'Room', 'Living Room', 'Bedroom', 'Furniture', 'Floor', 'Table',
  'Chair', 'Couch', 'Sofa', 'Bed', 'Wall', 'Door', 'Window', 'Lamp',
  'Carpet', 'Rug', 'Kitchen', 'Bathroom', 'Shelf', 'Cabinet',
  'Indoors', 'Interior Design', 'Home Decor',
]);

export function hasComplexBackground(labels: { Name: string; Confidence: number }[]): boolean {
  const count = labels.filter(l => l.Confidence >= 70 && BACKGROUND_LABELS.has(l.Name)).length;
  return count >= 3;
}
