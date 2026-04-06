// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    rules: {
      // ── No console statements in production code ──────────────
      'no-console': 'error',

      // ── React hooks correctness ────────────────────────────────
      // Catches missing useEffect/useCallback/useMemo deps
      'react-hooks/exhaustive-deps': 'warn',

      // ── No unused variables ────────────────────────────────────
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // ── Prefer const ──────────────────────────────────────────
      'prefer-const': 'error',

      // ── No non-null assertions (!.) ───────────────────────────
      // Encourages explicit null checks instead of user!.id
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
]);
