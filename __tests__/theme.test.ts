import {
  lightColors,
  darkColors,
  proColorsDark,
  proColorsLight,
  proColors,
  FontFamily,
  Typography,
  Spacing,
  BorderRadius,
  BorderWidth,
  Genders,
  Categories,
  CategoriesByGender,
  Conditions,
  Occasions,
  Sizes,
  Colours,
  Fabrics,
} from '../constants/theme';

// ─── lightColors / darkColors ─────────────────────────────────

describe('lightColors and darkColors', () => {
  const BASE_KEYS = [
    'primary', 'primaryDim', 'primaryLight', 'primaryText',
    'secondary', 'secondaryDim', 'secondaryLight',
    'background', 'surface', 'surfaceAlt',
    'textPrimary', 'textSecondary',
    'border', 'error', 'success', 'amber', 'like', 'overlay',
  ] as const;

  test('lightColors has all required keys', () => {
    BASE_KEYS.forEach(key => expect(lightColors).toHaveProperty(key));
  });

  test('darkColors has all required keys', () => {
    BASE_KEYS.forEach(key => expect(darkColors).toHaveProperty(key));
  });

  test('lightColors and darkColors expose the same set of keys', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  test('all lightColors values are non-empty strings', () => {
    Object.values(lightColors).forEach(val => {
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    });
  });

  test('all darkColors values are non-empty strings', () => {
    Object.values(darkColors).forEach(val => {
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    });
  });

  test('light and dark backgrounds are different', () => {
    expect(lightColors.background).not.toBe(darkColors.background);
  });

  test('light and dark text primaries are different', () => {
    expect(lightColors.textPrimary).not.toBe(darkColors.textPrimary);
  });
});

// ─── Pro palettes ─────────────────────────────────────────────

describe('proColorsDark and proColorsLight', () => {
  const PRO_KEYS = [
    'gradientTop', 'gradientBottom',
    'surface', 'surfaceElevated', 'border',
    'textPrimary', 'textSecondary',
    'primary', 'primaryDim', 'primaryLight', 'primaryText',
    'proAccent', 'proAccentText', 'cardBorder',
    'ctaBtnText',
    'boostAccent', 'boostAccentText',
    'secondary', 'secondaryDim', 'secondaryLight',
    'success', 'error', 'amber', 'like', 'overlay',
  ] as const;

  test('proColorsDark has all required Pro keys', () => {
    PRO_KEYS.forEach(key => expect(proColorsDark).toHaveProperty(key));
  });

  test('proColorsLight has all required Pro keys', () => {
    PRO_KEYS.forEach(key => expect(proColorsLight).toHaveProperty(key));
  });

  test('proColorsDark and proColorsLight expose the same set of keys', () => {
    expect(Object.keys(proColorsDark).sort()).toEqual(Object.keys(proColorsLight).sort());
  });

  test('all proColorsDark values are non-empty strings', () => {
    Object.values(proColorsDark).forEach(val => {
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    });
  });

  test('all proColorsLight values are non-empty strings', () => {
    Object.values(proColorsLight).forEach(val => {
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    });
  });

  test('proColors is an alias for proColorsDark (backwards compat)', () => {
    expect(proColors).toBe(proColorsDark);
  });

  test('dark and light gradient bottoms are different', () => {
    expect(proColorsDark.gradientBottom).not.toBe(proColorsLight.gradientBottom);
  });

  test('proColorsDark gold accent is the brand gold', () => {
    expect(proColorsDark.proAccent).toBe('#FBCD47');
  });

  test('proColorsLight gold accent is the brand gold', () => {
    expect(proColorsLight.proAccent).toBe('#FBCD47');
  });
});

// ─── FontFamily ───────────────────────────────────────────────

describe('FontFamily', () => {
  const WEIGHTS = ['thin', 'extraLight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extraBold', 'black'] as const;

  test('has all nine weight variants', () => {
    WEIGHTS.forEach(w => expect(FontFamily).toHaveProperty(w));
  });

  test('all values start with Inter_', () => {
    Object.values(FontFamily).forEach(val => {
      expect(val).toMatch(/^Inter_/);
    });
  });

  test('no duplicate font strings', () => {
    const vals = Object.values(FontFamily);
    expect(new Set(vals).size).toBe(vals.length);
  });
});

// ─── Typography ───────────────────────────────────────────────

describe('Typography', () => {
  const VARIANTS = ['display', 'heading', 'price', 'subheading', 'bodyLarge', 'body', 'caption', 'small', 'micro', 'label'] as const;

  test('has all required variants', () => {
    VARIANTS.forEach(v => expect(Typography).toHaveProperty(v));
  });

  VARIANTS.forEach(variant => {
    test(`${variant} has fontSize, fontFamily, and includeFontPadding`, () => {
      const t = Typography[variant];
      expect(typeof t.fontSize).toBe('number');
      expect(t.fontSize).toBeGreaterThan(0);
      expect(typeof t.fontFamily).toBe('string');
      expect(t.includeFontPadding).toBe(false);
    });
  });

  test('display is the largest font size', () => {
    const sizes = VARIANTS.map(v => Typography[v].fontSize);
    expect(Typography.display.fontSize).toBe(Math.max(...sizes));
  });

  test('micro is the smallest font size', () => {
    const sizes = VARIANTS.map(v => Typography[v].fontSize);
    expect(Typography.micro.fontSize).toBe(Math.min(...sizes));
  });
});

// ─── Spacing ─────────────────────────────────────────────────

describe('Spacing', () => {
  test('has all required keys', () => {
    ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'].forEach(k =>
      expect(Spacing).toHaveProperty(k)
    );
  });

  test('all values are positive numbers', () => {
    Object.values(Spacing).forEach(val => {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThan(0);
    });
  });

  test('values are in ascending order', () => {
    const ordered = [
      Spacing.xs, Spacing.sm, Spacing.md, Spacing.base,
      Spacing.lg, Spacing.xl, Spacing['2xl'], Spacing['3xl'], Spacing['4xl'],
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
    }
  });
});

// ─── BorderRadius ─────────────────────────────────────────────

describe('BorderRadius', () => {
  test('has small, medium, large, full', () => {
    ['small', 'medium', 'large', 'full'].forEach(k =>
      expect(BorderRadius).toHaveProperty(k)
    );
  });

  test('values are in ascending order', () => {
    expect(BorderRadius.small).toBeLessThan(BorderRadius.medium);
    expect(BorderRadius.medium).toBeLessThan(BorderRadius.large);
    expect(BorderRadius.large).toBeLessThan(BorderRadius.full);
  });

  test('full is large enough to produce pill shapes', () => {
    expect(BorderRadius.full).toBeGreaterThanOrEqual(999);
  });
});

// ─── BorderWidth ─────────────────────────────────────────────

describe('BorderWidth', () => {
  test('standard is a positive number', () => {
    expect(typeof BorderWidth.standard).toBe('number');
    expect(BorderWidth.standard).toBeGreaterThan(0);
  });
});

// ─── Genders ─────────────────────────────────────────────────

describe('Genders', () => {
  test('contains Men and Women', () => {
    expect(Genders).toContain('Men');
    expect(Genders).toContain('Women');
  });

  test('has exactly two values', () => {
    expect(Genders.length).toBe(2);
  });
});

// ─── Categories ──────────────────────────────────────────────

describe('Categories', () => {
  test('is non-empty', () => {
    expect(Categories.length).toBeGreaterThan(0);
  });

  test('first item is All', () => {
    expect(Categories[0]).toBe('All');
  });

  test('has no duplicates', () => {
    expect(new Set(Categories).size).toBe(Categories.length);
  });
});

// ─── CategoriesByGender ───────────────────────────────────────

describe('CategoriesByGender', () => {
  test('has Men and Women keys', () => {
    expect(CategoriesByGender).toHaveProperty('Men');
    expect(CategoriesByGender).toHaveProperty('Women');
  });

  test('each gender list is non-empty', () => {
    expect(CategoriesByGender.Men.length).toBeGreaterThan(0);
    expect(CategoriesByGender.Women.length).toBeGreaterThan(0);
  });

  test('no duplicates within Men', () => {
    expect(new Set(CategoriesByGender.Men).size).toBe(CategoriesByGender.Men.length);
  });

  test('no duplicates within Women', () => {
    expect(new Set(CategoriesByGender.Women).size).toBe(CategoriesByGender.Women.length);
  });
});

// ─── Fixed lists ─────────────────────────────────────────────

describe('Conditions', () => {
  test('contains the four standard conditions', () => {
    (['New', 'Excellent', 'Good', 'Fair'] as const).forEach(c =>
      expect(Conditions).toContain(c)
    );
  });

  test('has no duplicates', () => {
    expect(new Set(Conditions).size).toBe(Conditions.length);
  });
});

describe('Occasions', () => {
  test('is non-empty with no duplicates', () => {
    expect(Occasions.length).toBeGreaterThan(0);
    expect(new Set(Occasions).size).toBe(Occasions.length);
  });

  test('includes core occasions', () => {
    (['Everyday', 'Wedding', 'Eid'] as const).forEach(o =>
      expect(Occasions).toContain(o)
    );
  });
});

describe('Sizes', () => {
  test('contains standard UK sizes', () => {
    (['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const).forEach(s =>
      expect(Sizes).toContain(s)
    );
  });

  test('includes Custom', () => {
    expect(Sizes).toContain('Custom');
  });

  test('has no duplicates', () => {
    expect(new Set(Sizes).size).toBe(Sizes.length);
  });
});

describe('Colours', () => {
  test('is non-empty with no duplicates', () => {
    expect(Colours.length).toBeGreaterThan(0);
    expect(new Set(Colours).size).toBe(Colours.length);
  });

  test('includes Other as a catch-all', () => {
    expect(Colours).toContain('Other');
  });
});

describe('Fabrics', () => {
  test('is non-empty with no duplicates', () => {
    expect(Fabrics.length).toBeGreaterThan(0);
    expect(new Set(Fabrics).size).toBe(Fabrics.length);
  });

  test('includes core South Asian fabrics', () => {
    (['Silk', 'Chiffon', 'Georgette'] as const).forEach(f =>
      expect(Fabrics).toContain(f)
    );
  });

  test('includes Other as a catch-all', () => {
    expect(Fabrics).toContain('Other');
  });
});
