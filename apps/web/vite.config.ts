/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { formatHex, parse } from 'culori'
import { APP_ROUTES } from './src/pwa-routes.ts'

// The app is served by the Worker (apps/worker, Workers Static Assets), on the
// same origin as /api and /auth: the session cookie is SameSite=Strict and
// writes are Origin-checked (ADR 0003). In development, `vite` proxies those
// paths to the e2e harness (`pnpm --filter @hecate/worker harness`), started
// with PUBLIC_URL set to this dev server's origin.
const API = process.env.HECATE_API ?? 'http://localhost:8788'

type TokenNode = { $value?: unknown; $root?: TokenNode; $extensions?: Record<string, Record<string, string>> } & Record<string, unknown>
const TOKENS = JSON.parse(readFileSync(new URL('../../design/tokens/tokens.json', import.meta.url), 'utf8')) as TokenNode

/** A colour token as hex, light or dark, aliases followed: the manifest and meta tags need plain colours, never restated. */
function colour(path: string, theme: 'light' | 'dark' = 'light'): string {
  let node = path.split('.').reduce<TokenNode | undefined>((n, key) => n?.[key] as TokenNode | undefined, TOKENS)
  if (node && node.$value === undefined) node = node.$root
  if (!node) throw new Error(`No token ${path}`)
  const value = String((theme === 'dark' ? node.$extensions?.['dls.theme']?.dark : undefined) ?? node.$value)
  const alias = /^\{(.+)\}$/.exec(value)
  if (alias) return colour(alias[1] as string, theme)
  const hex = formatHex(parse(value))
  if (!hex) throw new Error(`${path} is not a colour: ${value}`)
  return hex
}

/** The browser's own chrome follows the surface colour, per colour scheme. */
function themeColour(): Plugin {
  return {
    name: 'hecate-theme-colour',
    transformIndexHtml: () =>
      (['light', 'dark'] as const).map(scheme => ({
        tag: 'meta',
        attrs: { name: 'theme-color', media: `(prefers-color-scheme: ${scheme})`, content: colour('color.bg.surface', scheme) },
        injectTo: 'head' as const,
      })),
  }
}

/** Installable, and the app shell loads offline. It never answers a Worker path, and never caches /api. */
const pwa = VitePWA({
  strategies: 'generateSW',
  registerType: 'prompt',
  // Registered from the app (src/shell/Updates.tsx): no inline script, so the CSP holds.
  injectRegister: false,
  // The manifest and its icons are precached by the plugin; these are the other files a page links.
  includeAssets: ['hecate-favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon-180x180.png'],
  manifest: {
    id: '/',
    name: 'HECATE',
    short_name: 'HECATE',
    description: 'Your week, your tasks and your board, kept in your own GitHub repository.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: colour('color.bg.surface'),
    background_color: colour('color.bg.canvas'),
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html}'],
    sourcemap: false,
    navigateFallback: '/index.html',
    navigateFallbackAllowlist: [...APP_ROUTES],
    cleanupOutdatedCaches: true,
    runtimeCaching: [],
  },
})

export default defineConfig({
  // The PWA plugin has no part in unit tests.
  plugins: [react(), tailwindcss(), themeColour(), ...(process.env.VITEST ? [] : [pwa])],
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
