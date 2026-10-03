import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.js', 'tests/browser/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
)
