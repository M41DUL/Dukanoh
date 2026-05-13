// Fixed list — not derived from Categories so new sell/browse
// categories don't shift the onboarding flow under returning users.
export const ONBOARDING_CATEGORIES = [
  'Lehenga', 'Saree', 'Anarkali',
  'Sherwani', 'Kurta', 'Achkan',
  'Pathani Suit', 'Casualwear', 'Shoes',
] as const;

export function getSubtitleText(count: number): string {
  if (count === 0) return 'Pick at least one to continue';
  if (count < 3) return `${count} selected`;
  return `${count} selected — nice taste!`;
}

export function toggleCategory(selected: string[], category: string): string[] {
  return selected.includes(category)
    ? selected.filter((c) => c !== category)
    : [...selected, category];
}
