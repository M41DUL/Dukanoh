// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // ── No console statements in production code ──────────────
      'no-console': 'error',

      // ── React hooks correctness ────────────────────────────────
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
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── Disable HTML-only rules not relevant to React Native ──
      'react/no-unescaped-entities': 'off',
    },
  },
]);
