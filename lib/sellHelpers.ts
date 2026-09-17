import { Categories, CategoriesByGender, Gender } from '@/constants/theme';

export interface ListingForm {
  title: string;
  description: string;
  price: string;
  gender: string;
  category: string;
  condition: string;
  occasion: string;
  size: string;
  colour: string;
  fabric: string;
  worn_at: string;
}

export type FormErrors = Partial<ListingForm & { images: string }>;

export function validateListing(
  form: ListingForm,
  imageCount: number,
  isDraft: boolean,
): FormErrors {
  const errors: FormErrors = {};

  if (imageCount === 0 && !isDraft) errors.images = 'Add at least one photo';

  if (!form.title.trim()) errors.title = 'Title is required';
  else if (form.title.trim().length < 3) errors.title = 'Title must be at least 3 characters';

  if (!isDraft) {
    if (!form.description.trim()) errors.description = 'Description is required';
    else if (form.description.trim().length < 10) errors.description = 'Description must be at least 10 characters';

    const price = parseFloat(form.price);
    if (!form.price.trim() || isNaN(price) || price < 1) errors.price = 'Enter a price of at least £1';
    else if (price > 2000) errors.price = 'Maximum price is £2,000';

    if (!form.category) errors.category = 'Select a category';
    else if (!CATEGORY_TO_GENDER[form.category] && !form.gender) {
      errors.gender = 'Select a gender';
    }
    if (!form.condition) errors.condition = 'Select a condition';
    if (!form.size && !SIZE_OPTIONAL_CATEGORIES.has(form.category)) errors.size = 'Select a size';
  }

  return errors;
}

export function buildMeasurements(note: string): { note: string } | null {
  const trimmed = note.trim();
  return trimmed ? { note: trimmed } : null;
}

/**
 * Categories listed under exactly one gender, derived from the theme so a new
 * category can't be forgotten here. Kurta, Salwar, Jewellery, Accessories,
 * Casualwear and Shoes sit under both and are absent — the seller picks.
 */
export const CATEGORY_TO_GENDER: Record<string, Gender> = Object.fromEntries(
  Categories
    .filter(c => c !== 'All')
    .flatMap((c): [string, Gender][] => {
      const women = CategoriesByGender.Women.includes(c);
      const men = CategoriesByGender.Men.includes(c);
      if (women && !men) return [[c, 'Women']];
      if (men && !women) return [[c, 'Men']];
      return [];
    }),
);

/** Pieces with no meaningful garment size — the size picker is optional. */
export const SIZE_OPTIONAL_CATEGORIES = new Set(['Dupatta', 'Jewellery', 'Accessories']);

export function isCategoryValidForGender(category: string, gender: string): boolean {
  const categories = CategoriesByGender[gender as Gender];
  return categories ? categories.includes(category) : false;
}

export function isFormDirty(form: ListingForm, measurementsNote: string, imageCount: number): boolean {
  return !!(
    form.title || form.description || form.price || form.gender ||
    form.category || form.condition || form.occasion || form.size ||
    form.colour || form.fabric || form.worn_at ||
    measurementsNote ||
    imageCount > 0
  );
}
