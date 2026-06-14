/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Skip the PWA plugin under Vitest — it has no role in the unit tests and
// keeps the test runner's vite.config load lean.
const pwaPlugin = process.env.VITEST
  ? []
  : [VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'HECATE',
        short_name: 'HECATE',
        description: 'Holistic Execution Control for Analytics Tracking and Evaluation',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#0a0b0e',
        background_color: '#0a0b0e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the static app shell only. No runtimeCaching → cross-origin
        // api.github.com requests always hit the network, so the SW can never
        // serve stale data or interfere with the stale-data detector.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallback: '/HECATE/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    })]

export default defineConfig({
  plugins: [react(), ...pwaPlugin],
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
