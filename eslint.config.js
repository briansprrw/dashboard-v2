import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/web/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/server/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.worker,
    },
  },
  {
    files: ['test/**/*.ts', 'vite.config.ts', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.worker },
    },
  }
);
