import { Categories } from '@/constants/theme';

// ─── Category layout data ───────────────────────────────────
export type BubbleLayout = { left: number; top: number; size: number };

export const BASE_WIDTH = 390; // iPhone 14 baseline for scaling

export const ONBOARDING_CATEGORIES = Categories.filter((c) => c !== 'All');

export const CATEGORY_LAYOUT: BubbleLayout[] = [
  // Row 1
  { left: 0.02, top: 0.00, size: 96 },   // Lehenga
  { left: 0.32, top: 0.02, size: 110 },  // Saree
  { left: 0.66, top: 0.00, size: 86 },   // Anarkali
  // Row 2
  { left: 0.04, top: 0.24, size: 104 },  // Sherwani
  { left: 0.40, top: 0.22, size: 90 },   // Kurta
  { left: 0.68, top: 0.24, size: 80 },   // Achkan
  // Row 3
  { left: 0.02, top: 0.48, size: 114 },  // Pathani Suit
  { left: 0.38, top: 0.46, size: 88 },   // Casualwear
  { left: 0.66, top: 0.48, size: 82 },   // Shoes
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
