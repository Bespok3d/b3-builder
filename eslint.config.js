import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// b3-builder's own lint gate. Non-type-checked recommended (fast, no project graph) plus the two
// structural rules the Bespok3d engineering rules make load-bearing: nesting beyond one level is
// suspicious (max-depth 2), and a nested ternary is a named-lookup in disguise. RULE ZERO (the
// em-dash / en-dash ban) is guarded separately in scripts/rule-zero-guard.mjs, since no lint rule
// covers it and it must scan every authored format, not just the JS the linter parses.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test/golden/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-nested-ternary': 'error',
      'max-depth': ['error', 2],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
)
