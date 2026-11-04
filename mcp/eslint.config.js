import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The v1 MCP server is plain Node TypeScript — no DOM, no React.
export default tseslint.config(
  { ignores: ['node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
)
