import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  {
    // Type-aware rules only where there are types to be aware of. Applying them
    // globally makes ESLint demand type information for plain .js/.mjs files.
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      // Assertion helpers routinely return promises we intentionally await one level up.
      '@typescript-eslint/no-floating-promises': 'off',
      // Passing a mock to expect() reads as an unbound method to this rule, but
      // the mock is never called through it.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Config and tooling scripts run in Node, not the browser.
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
