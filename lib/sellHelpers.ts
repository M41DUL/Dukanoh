import { CategoriesByGender, Gender } from '@/constants/theme';

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

    // gender is optional — auto-inferred for most categories; unisex items may omit it
    if (!form.category) errors.category = 'Select a category';
    if (!form.condition) errors.condition = 'Select a condition';
    if (!form.size) errors.size = 'Select a size';
  }

  return errors;
}

export function buildMeasurements(note: string): { note: string } | null {
  const trimmed = note.trim();
  return trimmed ? { note: trimmed } : null;
}

export const CATEGORY_TO_GENDER: Record<string, Gender> = {
  Lehenga:        'Women',
  Saree:          'Women',
  Anarkali:       'Women',
  Dupatta:        'Women',
  Blouse:         'Women',
  Sharara:        'Women',
  Sherwani:       'Men',
  Achkan:         'Men',
  'Pathani Suit': 'Men',
  'Nehru Jacket': 'Men',
};

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
