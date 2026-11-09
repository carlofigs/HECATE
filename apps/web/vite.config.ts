/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app is served by the Worker (apps/worker, Workers Static Assets), on the
// same origin as /api and /auth: the session cookie is SameSite=Strict and
// writes are Origin-checked (ADR 0003). In development, `vite` proxies those
// paths to the e2e harness (`pnpm --filter @hecate/worker harness`), started
// with PUBLIC_URL set to this dev server's origin.
const API = process.env.HECATE_API ?? 'http://localhost:8788'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(['/api', '/auth'].map(path => [path, { target: API, changeOrigin: false }])),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Libraries change less often than the app: separate chunks stay cached across deploys.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler|zustand|use-sync-external-store)[\\/]/ },
            { name: 'core', test: /packages[\\/]core[\\/]|node_modules[\\/](zod|immer|fractional-indexing)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
