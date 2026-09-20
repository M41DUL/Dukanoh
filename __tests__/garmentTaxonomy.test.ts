// The edge functions carry their own copy of the taxonomy (they can't import
// the app's theme). This test is the lock: if constants/theme.ts changes and
// _shared/garmentTaxonomy.ts doesn't, the build fails here.
import { Categories, CategoriesByGender, CategoryDefinitions, Colours, Conditions, Fabrics, Occasions, Genders, Sizes } from '../constants/theme';
import {
  CATEGORIES, CATEGORIES_BY_GENDER, CATEGORY_DEFINITIONS, COLOURS, CONDITIONS, FABRICS, GENDERS, OCCASIONS, SIZES, TAXONOMY_VERSION,
} from '../supabase/functions/_shared/garmentTaxonomy';

describe('edge taxonomy mirrors the app theme', () => {
  test('categories, in the same order', () => {
    expect([...CATEGORIES]).toEqual(Categories.filter(c => c !== 'All'));
  });
  test('definitions, word for word', () => {
    expect(CATEGORY_DEFINITIONS).toEqual(CategoryDefinitions);
  });
  test('categories by gender', () => {
    expect(CATEGORIES_BY_GENDER.Women).toEqual(CategoriesByGender.Women);
    expect(CATEGORIES_BY_GENDER.Men).toEqual(CategoriesByGender.Men);
  });
  test('colours, fabrics, occasions, genders', () => {
    expect([...COLOURS]).toEqual([...Colours]);
    expect([...FABRICS]).toEqual([...Fabrics]);
    expect([...OCCASIONS]).toEqual([...Occasions]);
    expect([...GENDERS]).toEqual([...Genders]);
    expect([...SIZES]).toEqual([...Sizes]);
    expect([...CONDITIONS]).toEqual([...Conditions]);
  });
  test('taxonomy version is the 2026-09 refresh', () => {
    expect(TAXONOMY_VERSION).toBe(2);
  });
});
