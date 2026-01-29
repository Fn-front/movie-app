import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  // Ignore patterns
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'dist/**',
      'next-env.d.ts',
    ],
  },

  // JavaScript recommended
  js.configs.recommended,

  // TypeScript recommended
  ...tseslint.configs.recommended,

  // React and Next.js
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
    },
    rules: {
      // React
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-array-index-key': 'warn',

      // React Hooks
      ...reactHooksPlugin.configs.recommended.rules,

      // Next.js
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // Code style
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'jsx-quotes': ['warn', 'prefer-single'],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
