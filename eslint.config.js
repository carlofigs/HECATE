import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ESLint config for the v2 packages. The frozen v1 packages (apps/web-v1, mcp)
// keep their own ESLint 9 configs: `pnpm lint` runs each package's own eslint
// binary from its own directory, so neither ever loads this file. They are
// ignored here as well so nothing at the root can lint them by accident.
export default defineConfig([
  globalIgnores(['apps/web-v1/**', 'mcp/**', '**/json-schema/**', '**/dist/**']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // The data contract runs in the browser, the Worker and Node alike, and its
    // dates must not depend on the machine's time zone. Keep it free of Node
    // APIs and of every local-time Date method; dates.ts works in UTC day
    // numbers and the workspace's time zone only.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*'], message: 'core must stay platform-neutral.' }] }],
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.property.name=/^(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)$/]",
          message: 'Local-time Date methods depend on the machine time zone. Use the getUTC*/setUTC* forms via dates.ts.',
        },
        {
          selector: "CallExpression[callee.property.name=/^(getTimezoneOffset|toLocaleString|toLocaleDateString|toLocaleTimeString)$/]",
          message: 'Machine-time-zone and ICU-dependent output. Use dates.ts (todayIn / formatDay).',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value=/./]",
          message: 'new Date(string) parses some formats as local time. Use isoDate() / Date.UTC.',
        },
      ],
    },
  },
  {
    // Tests break valid fixtures on purpose by poking raw JSON. The unsafe-any
    // rules exist to protect production code from untyped data; in a test that
    // is the point.
    files: ['**/*.test.ts', '**/__fixtures__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Config files that are plain JS: no type information to lint with.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
])
