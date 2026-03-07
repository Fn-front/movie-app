import { createRequire } from 'module';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const localRules = require('./eslint-local-rules');

export default [
  // Ignore patterns
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'dist/**',
      'e2e/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      'eslint-local-rules/**',
    ],
  },

  // JavaScript recommended
  js.configs.recommended,

  // TypeScript recommended
  ...tseslint.configs.recommended,

  // Import plugin (import-x for ESLint 9 compatibility)
  importX.flatConfigs.recommended,

  // React and Next.js
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
      local: localRules,
    },
    rules: {
      // React
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-array-index-key': 'error',

      // React Hooks
      ...reactHooksPlugin.configs.recommended.rules,

      // Next.js
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // Import rules (using import-x for ESLint 9)
      'import-x/no-named-as-default': 'off',
      'import-x/no-unresolved': [
        'error',
        {
          ignore: ['\\.scss$', '\\.css$', '\\.(png|jpg|jpeg|gif|svg)$'],
        },
      ],

      // Custom rules
      'local/require-effect-cleanup': 'warn',

      // Code style
      quotes: ['error', 'single', { avoidEscape: true }],
      'jsx-quotes': ['error', 'prefer-single'],
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      },
      'import-x/ignore': ['\\.scss$', '\\.css$', '\\.(png|jpg|jpeg|gif|svg)$'],
    },
  },
];
