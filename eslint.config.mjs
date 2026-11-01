import js from '@eslint/js';
import babel from '@babel/eslint-parser';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Babel parses TS syntax without replacing the application's TypeScript 7 compiler.
// TypeScript remains responsible for identifier/type checking; ESLint checks
// control-flow hazards, unsafe syntax and React hook ordering/dependencies.
export default [
  { ignores: ['node_modules/**', 'dist*/**', 'release/**', 'tmp/**', 'coverage/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: babel,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { babelrc: false, configFile: false,
          parserOpts: { plugins: ['typescript'] } },
      },
    },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: { parserOptions: { babelOptions: { parserOpts: { plugins: ['typescript', 'jsx'] } } } },
  },
  {
    // Intentional validation rejects ASCII control characters in user-supplied
    // text and attachment names; these are security filters, not accidental regexes.
    files: ['shared/release.ts', 'shared/contracts.ts', 'shared/finance.ts', 'shared/integrations.ts', 'shared/life-events.ts', 'shared/registration.ts', 'shared/security.ts', 'electron/database/life-events-store.ts'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
];
