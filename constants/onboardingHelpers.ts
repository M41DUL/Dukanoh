import { Categories } from '@/constants/theme';

// ─── Category layout data ───────────────────────────────────
export type BubbleLayout = { left: number; top: number; size: number };

export const BASE_WIDTH = 390; // iPhone 14 baseline for scaling

export const ONBOARDING_CATEGORIES = Categories.filter((c) => c !== 'All');

export const CATEGORY_LAYOUT: BubbleLayout[] = [
  // Row 1
  { left: 0.02, top: 0.00, size: 78 },   // Men
  { left: 0.30, top: 0.02, size: 96 },   // Women
  { left: 0.62, top: 0.00, size: 110 },  // Casualwear
  // Row 2
  { left: 0.05, top: 0.24, size: 104 },  // Partywear
  { left: 0.42, top: 0.22, size: 82 },   // Festive
  { left: 0.70, top: 0.24, size: 74 },   // Formal
  // Row 3
  { left: 0.02, top: 0.48, size: 86 },   // Achkan
  { left: 0.34, top: 0.46, size: 98 },   // Wedding
  // Row 4
  { left: 0.06, top: 0.72, size: 114 },  // Pathani Suit
  { left: 0.48, top: 0.74, size: 76 },   // Shoes
];

// ─── Centre-out distances for stagger ────────────────────────
export const CENTRE = { x: 0.45, y: 0.35 };

export function computeDistances(layouts: BubbleLayout[], centre: { x: number; y: number }) {
  return layouts.map((l) =>
    Math.sqrt((l.left - centre.x) ** 2 + (l.top - centre.y) ** 2),
  );
}

export const CATEGORY_DISTANCES = computeDistances(CATEGORY_LAYOUT, CENTRE);
export const MAX_DIST = Math.max(...CATEGORY_DISTANCES);

// ─── Entrance delay (centre-out stagger) ────────────────────
export function getEntranceDelay(index: number): number {
  const normDist = CATEGORY_DISTANCES[index] / MAX_DIST;
  return 200 + normDist * 800;
}

// ─── Responsive bubble size ──────────────────────────────────
export function getScaledSize(baseSize: number, screenWidth: number): number {
  return baseSize * (screenWidth / BASE_WIDTH);
}

export function getActiveBubbleSize(baseSize: number, screenWidth: number, active: boolean): number {
  const scaled = getScaledSize(baseSize, screenWidth);
  return active ? scaled * 1.06 : scaled;
}

// ─── Dynamic subtitle ───────────────────────────────────────
export function getSubtitleText(count: number): string {
  if (count === 0) return 'Pick at least one';
  if (count < 3) return `${count} selected`;
  return `${count} selected \u2014 nice taste!`;
}

// ─── Category toggle ────────────────────────────────────────
export function toggleCategory(selected: string[], category: string): string[] {
  return selected.includes(category)
    ? selected.filter((c) => c !== category)
    : [...selected, category];
}
