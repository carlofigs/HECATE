/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/HECATE/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Unit tests for the risky core (store, github encoding, schema guards).
    // Pure logic — no DOM needed, so the lighter node environment.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
