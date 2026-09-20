import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'api/node_modules'] },
  {
    // The API is CommonJS on the Functions host. It is linted for undeclared
    // identifiers above all: an assignment to an undeclared variable throws
    // at runtime under 'use strict', which is how a 500 shipped unnoticed.
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Pre-existing tidiness findings elsewhere in the API stay advisory so
      // the gate keeps failing only on what actually breaks at runtime.
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Stable React hooks rules only. The experimental react-compiler rules
      // (set-state-in-effect / refs) bundled into `recommended` flag idiomatic,
      // correct patterns (documented latest-ref, setState inside timer
      // callbacks), so we don't enable them.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      complexity: ['warn', 18],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
);
