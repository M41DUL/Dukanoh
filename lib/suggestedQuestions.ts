/**
 * Pure logic for the buyer-only suggested-question chips shown in a
 * conversation. Extracted from app/conversation/[id].tsx so it can be unit
 * tested. Chips are gap-driven from the listing's own fields, hidden once the
 * thread gets going, and never repeat a question the buyer already sent.
 */

// Occasions where delivery timing matters enough to prompt the buyer to ask.
export const TIME_SENSITIVE_OCCASIONS = ['Wedding', 'Festive', 'Partywear'];

// A measurements object counts as "filled" only if at least one field has a
// real value — sellers can leave it as an empty/all-null object.
export function hasMeasurements(m: Record<string, unknown> | null): boolean {
  if (!m) return false;
  return Object.values(m).some(v => v !== null && v !== undefined && String(v).trim() !== '');
}

export interface SuggestedQuestionInput {
  isBuyer: boolean;
  canBuy: boolean;
  messageCount: number;
  /** Contents of messages already in the thread (used to drop already-asked chips). */
  askedContents: string[];
  measurements: Record<string, unknown> | null;
  imageCount: number;
  condition: string | null;
  category: string | null;
  occasion: string | null;
}

/** Returns up to 4 suggested questions, or [] when chips shouldn't show. */
export function buildSuggestedQuestions(input: SuggestedQuestionInput): string[] {
  if (!input.isBuyer || !input.canBuy) return [];
  if (input.messageCount >= 6) return [];

  const asked = new Set(input.askedContents.map(c => c.trim().toLowerCase()));

  const candidates: string[] = [];
  if (!hasMeasurements(input.measurements)) candidates.push('What are the measurements?');
  if (input.imageCount <= 1) candidates.push('Can you send more photos?');
  if (input.condition && !/^new/i.test(input.condition)) candidates.push('Any flaws or damage?');
  if (input.category === 'Shoes') candidates.push('Is it true to size?');
  if (input.occasion && TIME_SENSITIVE_OCCASIONS.includes(input.occasion)) candidates.push('Will it arrive in time?');
  if (input.occasion === 'Wedding') candidates.push('Is this authentic?');
  candidates.push('Is this still available?'); // always-available fallback, last

  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of candidates) {
    const key = q.toLowerCase();
    if (seen.has(key) || asked.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 4) break;
  }
  return out;
}
