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

export interface Measurements {
  chest: string;
  waist: string;
  length: string;
}

export type FormErrors = Partial<ListingForm & { images: string; chest: string; waist: string; length: string }>;

export function validateListing(
  form: ListingForm,
  measurements: Measurements,
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

    if (!form.gender) errors.gender = 'Select a gender';
    if (!form.category) errors.category = 'Select a category';
    if (!form.condition) errors.condition = 'Select a condition';
    if (!form.size) errors.size = 'Select a size';
  }

  (['chest', 'waist', 'length'] as const).forEach(key => {
    const val = measurements[key];
    if (val) {
      const num = parseFloat(val);
      if (isNaN(num) || num < 1 || num > 99) {
        (errors as any)[key] = 'Must be 1–99';
      }
    }
  });

  return errors;
}

export function buildMeasurements(measurements: Measurements): Record<string, number> | null {
  const chest = parseFloat(measurements.chest);
  const waist = parseFloat(measurements.waist);
  const length = parseFloat(measurements.length);
  const obj: Record<string, number> = {};
  if (!isNaN(chest) && chest > 0) obj.chest = chest;
  if (!isNaN(waist) && waist > 0) obj.waist = waist;
  if (!isNaN(length) && length > 0) obj.length = length;
  return Object.keys(obj).length > 0 ? obj : null;
}

export function isCategoryValidForGender(category: string, gender: string): boolean {
  const categories = CategoriesByGender[gender as Gender];
  return categories ? categories.includes(category) : false;
}

export function isFormDirty(form: ListingForm, measurements: Measurements, imageCount: number): boolean {
  return !!(
    form.title || form.description || form.price || form.gender ||
    form.category || form.condition || form.occasion || form.size ||
    form.colour || form.fabric || form.worn_at ||
    measurements.chest || measurements.waist || measurements.length ||
    imageCount > 0
  );
}
