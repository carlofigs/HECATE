import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

/**
 * The v2 app's end-to-end and accessibility gate (DESIGN-STANDARD R-29 layer
 * 1, and the P4 acceptance checks): the built web app served by the bundled
 * Worker in workerd, against the fake GitHub (e2e/harness.ts). Nothing here
 * reaches GitHub or Cloudflare.
 *
 * Chromium only, at the three widths the design layer is held to: a phone
 * with touch (touch-first density), R-10's 320 px floor, and a desktop with a
 * fine pointer. Each runs in both colour schemes, because the dark theme is
 * validated separately (T-15).
 *
 * PLAYWRIGHT_CHROMIUM_PATH points at a preinstalled browser when the one this
 * Playwright version expects is not downloaded (CI installs it).
 */
const PORT = Number(process.env.E2E_PORT ?? 8788)
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

const sizes = [
  { name: 'phone', use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } },
  { name: 'narrow', use: { viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true } },
  { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
] as const

const projects: PlaywrightTestConfig['projects'] = sizes.flatMap(size =>
  (['light', 'dark'] as const).map(colorScheme => ({ name: `${size.name}-${colorScheme}`, use: { ...size.use, colorScheme } })),
)

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // The harness runs the real Worker in workerd; on a busy runner a write and its commit can take a few seconds.
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    // The app's service worker would sit between the page and every route mock; pwa.spec.ts allows it.
    serviceWorkers: 'block',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects,
  webServer: {
    command: 'tsx harness.ts',
    url: `http://localhost:${PORT}/health`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
