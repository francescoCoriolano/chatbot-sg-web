// @ts-check

const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat();

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // Extend Next.js ESLint configuration
  ...compat.extends('next/core-web-vitals'),

  // Define custom rules
  {
    rules: {
      // Disable var rule
      'no-var': 'off',
      // Disable any type rule
      '@typescript-eslint/no-explicit-any': 'off',
      // Add reasonable rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'warn',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Turn off some rules that might be too strict for this project
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
