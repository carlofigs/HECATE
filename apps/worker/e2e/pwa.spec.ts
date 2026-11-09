/**
 * Installable and offline-safe (P4): the manifest and its icons, a service
 * worker that answers only the app's own routes and caches no API response,
 * an offline reload that shows the app rather than the browser's error page,
 * and a change made offline that is kept, guarded on unload, and saved on
 * reconnect.
 */
import { expect, test, type Page } from '@playwright/test'
import { claimWorkspace, columnKeys, committed, NOW, scan, signIn } from './support.ts'

test.use({ serviceWorkers: 'allow' })

/** Waits until a service worker controls the page, reloading once as a returning visit would. */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('the manifest makes it installable, with its icons', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as Record<string, unknown> & { icons: { src: string; sizes: string; purpose?: string }[] }
  expect(manifest).toMatchObject({ name: 'HECATE', start_url: '/', scope: '/', display: 'standalone' })
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/)
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/)
  expect(manifest.icons.map(i => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512 maskable']))
  for (const icon of manifest.icons) {
    const response = await request.get(`/${icon.src}`)
    expect(response.headers()['content-type'], icon.src).toBe('image/png')
  }
  const colours = await page.locator('meta[name="theme-color"]').evaluateAll(metas => metas.map(m => m.getAttribute('media')))
  expect(colours).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
})

test('the service worker answers only the app: sign-in, the API and health reach the Worker', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await controlled(page)
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js$/)

  const health = await page.goto('/health')
  expect(await health?.json()).toEqual({ ok: true })
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname)
    return urls
  })
  expect(cached).toContain('/index.html')
  expect(cached.filter(path => path.startsWith('/api') || path.startsWith('/auth'))).toEqual([])
})

test('offline, a reload still opens the app and says what is wrong', async ({ page, context }) => {
  await signIn(page)
  await controlled(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'HECATE' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText("Can't reach HECATE")
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
})

test('a change made offline is kept, guarded on unload, and saved on reconnect', async ({ page, context }) => {
  await signIn(page)
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board?status=in-progress`)
  await expect(page.getByRole('article').first()).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible()
  await scan(page, 'the Board, offline')
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Offline · 1 change waiting' })).toBeVisible()

  // Closing the tab now would lose the change: the browser asks first.
  let asked = ''
  page.once('dialog', dialog => {
    asked = dialog.type()
    void dialog.dismiss()
  })
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => asked).toBe('beforeunload')
})

test('back online, a waiting change is sent at once', async ({ page, context }) => {
  await signIn(page)
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board?status=in-progress`)
  await expect(page.getByRole('article').first()).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Offline · 1 change waiting' })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toHaveCount(0)
  const { tasks } = await committed(page, dir)
  expect(tasks.find(t => t.key === 'A1')).toMatchObject({ status: 'done' })
  expect(await columnKeys(page, 'In Progress')).toEqual(['A5'])
})
