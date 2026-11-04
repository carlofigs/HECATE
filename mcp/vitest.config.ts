import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The server shares schemas, migrate and validate with the v1 app (imported by
// relative path). Those files reach each other through the app's `@/` alias,
// so mirror it here for any value import that survives type erasure.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '../apps/web-v1/src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
