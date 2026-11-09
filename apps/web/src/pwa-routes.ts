/**
 * The app's own routes: the only navigations the service worker may answer
 * with the cached app (vite.config.ts `navigateFallbackAllowlist`). Every
 * other path goes to the network untouched — above all the Worker's own
 * (sign-in, /api, /mcp, OAuth, hooks; wrangler.jsonc `run_worker_first`),
 * which pwa-routes.test.ts checks. A new top-level app route goes here.
 */
export const APP_ROUTES: readonly RegExp[] = [/^\/$/, /^\/w\//]
