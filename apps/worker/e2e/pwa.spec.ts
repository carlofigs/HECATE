/**
 * Installable and offline-safe (P4, P6): the manifest and its icons, a
 * service worker that answers only the app's own routes and caches no API
 * response, and the device copy (ADR 0009): an offline reload shows the
 * workspace with its unsent changes, which are saved on reconnect, and
 * signing out clears the device.
 */
import { expect, test, type Page } from '@playwright/test'
import { claimWorkspace, columnKeys, committed, NOW, scan, signIn } from './support.ts'

test.use({ serviceWorkers: 'allow' })

/** What the device copy holds: a count per store, or nothing at all. Never creates the database. */
function deviceCopy(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const open = indexedDB.open('hecate')
        // The database does not exist: do not create it.
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve({})
        open.onsuccess = () => {
          const db = open.result
          const names = [...db.objectStoreNames]
          const out: Record<string, number> = {}
          const tx = db.transaction(names)
          for (const name of names) {
            const count = tx.objectStore(name).count()
            count.onsuccess = () => void (out[name] = count.result)
          }
          tx.oncomplete = () => {
            db.close()
            resolve(out)
          }
          tx.onerror = () => reject(tx.error ?? new Error('read failed'))
        }
      }),
  )
}

/** The workspaces with a copy on this device. */
function copiedWorkspaces(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>(resolve => {
        const open = indexedDB.open('hecate')
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve([])
        open.onsuccess = () => {
          const db = open.result
          const keys = db.transaction('snapshots').objectStore('snapshots').getAllKeys()
          keys.onsuccess = () => {
            db.close()
            resolve(keys.result.map(String))
          }
        }
      }),
  )
}

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

test('offline, a reload opens the workspace from the copy kept on this device', async ({ page, context }) => {
  await signIn(page)
  await controlled(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  await expect.poll(() => deviceCopy(page)).toMatchObject({ session: 1, snapshots: 1, batches: 0 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Offline · as of / })).toBeVisible()
  await expect(page.getByRole('region', { name: 'In progress' }).getByText('Draft the scorecard')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: /^Up to date/ })).toBeVisible()
})

test('with nothing kept on this device, an offline reload says what is wrong', async ({ page, context }) => {
  await signIn(page)
  await controlled(page)
  await expect.poll(() => deviceCopy(page)).toMatchObject({ session: 1 })
  // The app's own connection gives way (onversionchange), so the delete goes through.
  await page.evaluate(() => new Promise(resolve => { indexedDB.deleteDatabase('hecate').onsuccess = resolve }))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'HECATE' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText("Can't reach HECATE")
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
})

test('a change made offline survives a reload, and is saved on reconnect', async ({ page, context }) => {
  await signIn(page)
  await controlled(page)
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board?status=in-progress`)
  await expect(page.getByRole('article').first()).toBeVisible()
  await expect.poll(() => copiedWorkspaces(page)).toContain(dir)

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toContainText('kept on this device')
  await scan(page, 'the Board, offline')
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Offline · 1 change waiting' })).toBeVisible()
  await expect.poll(() => deviceCopy(page)).toMatchObject({ batches: 1 })

  // Nothing to guard: the change is on the device, so the reload goes ahead without asking.
  const asked: string[] = []
  page.on('dialog', dialog => {
    asked.push(dialog.type())
    void dialog.dismiss()
  })
  await page.reload()
  await expect(page.getByRole('article').first()).toBeVisible()
  expect(asked).toEqual([])
  expect(await columnKeys(page, 'In Progress')).toEqual(['A5'])
  await expect(page.getByRole('status').filter({ hasText: 'Offline · 1 change waiting' })).toBeVisible()

  await context.setOffline(false)
  const { tasks } = await committed(page, dir)
  expect(tasks.find(t => t.key === 'A1')).toMatchObject({ status: 'done' })
  await expect.poll(() => deviceCopy(page)).toMatchObject({ batches: 0 })
})

test('signing out with a change waiting asks first, then clears the device, and finishes once online', async ({ page, context }) => {
  await signIn(page)
  await controlled(page)
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board?status=in-progress`)
  await expect(page.getByRole('article').first()).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Offline · 1 change waiting' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Sign out and lose 1 change?' })
  await expect(confirm).toContainText("1 change hasn't been sent")
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await scan(page, 'the sign-out confirmation')
  await confirm.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible()
  expect(await deviceCopy(page)).toEqual({ session: 0, snapshots: 0, batches: 0 })
  expect(await page.evaluate(() => localStorage.getItem('hecate:sign-out'))).toBe('1')

  // The cookie could not be cleared offline: the next start does it.
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hecate:sign-out'))).toBeNull()
  expect((await page.request.get('/api/me')).status()).toBe(401)
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
