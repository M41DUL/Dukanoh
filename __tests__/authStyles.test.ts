import {
  EMAIL_REGEX,
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
  getPasswordStrength,
  validateUsername,
  getAuthError,
  withTimeout,
} from '../constants/authStyles';

// ─── EMAIL_REGEX ─────────────────────────────────────────────

describe('EMAIL_REGEX', () => {
  const valid = [
    'user@example.com',
    'name@domain.co.uk',
    'first.last@company.org',
    'user+tag@gmail.com',
    'u@d.co',
  ];

  const invalid = [
    '',
    'plaintext',
    '@missing-local.com',
    'missing-domain@',
    'missing@.com',
    'spaces in@email.com',
    'two@@signs.com',
  ];

  test.each(valid)('accepts valid email: %s', (email) => {
    expect(EMAIL_REGEX.test(email)).toBe(true);
  });

  test.each(invalid)('rejects invalid email: %s', (email) => {
    expect(EMAIL_REGEX.test(email)).toBe(false);
  });
});

// ─── validateUsername ────────────────────────────────────────

describe('validateUsername', () => {
  test('returns empty string for empty input', () => {
    expect(validateUsername('')).toBe('');
  });

  test('rejects usernames shorter than minimum', () => {
    expect(validateUsername('ab')).toContain(`${USERNAME_MIN}`);
  });

  test('accepts username at minimum length', () => {
    expect(validateUsername('abc')).toBe('');
  });

  test('accepts username at maximum length', () => {
    expect(validateUsername('a'.repeat(USERNAME_MAX))).toBe('');
  });

  test('rejects username over maximum length', () => {
    expect(validateUsername('a'.repeat(USERNAME_MAX + 1))).toContain(`${USERNAME_MAX}`);
  });

  test('accepts lowercase letters, numbers, underscores', () => {
    expect(validateUsername('user_123')).toBe('');
  });

  test('rejects uppercase letters', () => {
    expect(validateUsername('User')).not.toBe('');
  });

  test('rejects spaces', () => {
    expect(validateUsername('user name')).not.toBe('');
  });

  test('rejects special characters', () => {
    expect(validateUsername('user@name')).not.toBe('');
    expect(validateUsername('user-name')).not.toBe('');
    expect(validateUsername('user.name')).not.toBe('');
  });
});

// ─── getPasswordStrength ─────────────────────────────────────

describe('getPasswordStrength', () => {
  test('returns null for empty string', () => {
    expect(getPasswordStrength('')).toBeNull();
  });

  test('returns error for password under minimum length', () => {
    const result = getPasswordStrength('abc');
    expect(result).not.toBeNull();
    expect(result!.label).toContain(`${PASSWORD_MIN}`);
  });

  test('returns Weak for short simple password', () => {
    const result = getPasswordStrength('abcdef');
    expect(result!.label).toMatch(/weak/i);
  });

  test('returns Good for 8+ chars with 2 types', () => {
    const result = getPasswordStrength('abcdef12');
    expect(result!.label).toMatch(/good/i);
  });

  test('returns Strong for 10+ chars with 3+ types', () => {
    const result = getPasswordStrength('Abcdef123!');
    expect(result!.label).toMatch(/strong/i);
  });

  test('8 chars with only lowercase is Weak', () => {
    const result = getPasswordStrength('abcdefgh');
    expect(result!.label).toMatch(/weak/i);
  });

  test('10 chars with only 2 types is Good, not Strong', () => {
    const result = getPasswordStrength('abcdefgh12');
    expect(result!.label).toMatch(/good/i);
  });

  test('10 chars with upper + lower + number is Strong', () => {
    const result = getPasswordStrength('Abcdefgh12');
    expect(result!.label).toMatch(/strong/i);
  });
});

// ─── getAuthError ────────────────────────────────────────────

describe('getAuthError', () => {
  test('returns timeout message for timeout error', () => {
    const err = new Error('__TIMEOUT__');
    const result = getAuthError(err, 'fallback');
    expect(result).toContain('timed out');
  });

  test('returns network message for network error', () => {
    const err = new Error('Network request failed');
    const result = getAuthError(err, 'fallback');
    expect(result).toContain('internet');
  });

  test('returns fallback for generic error', () => {
    const err = new Error('something else');
    expect(getAuthError(err, 'Custom fallback')).toBe('Custom fallback');
  });

  test('returns fallback for non-Error objects', () => {
    expect(getAuthError('string error', 'fallback')).toBe('fallback');
    expect(getAuthError(null, 'fallback')).toBe('fallback');
    expect(getAuthError(42, 'fallback')).toBe('fallback');
  });
});

// ─── withTimeout ─────────────────────────────────────────────

describe('withTimeout', () => {
  test('resolves when promise finishes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('done'), 1000);
    expect(result).toBe('done');
  });

  test('rejects with timeout error when promise is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50)).rejects.toThrow('__TIMEOUT__');
  });

  test('passes through promise rejection', async () => {
    const failing = Promise.reject(new Error('auth failed'));
    await expect(withTimeout(failing, 1000)).rejects.toThrow('auth failed');
  });
});
