/**
 * P4 acceptance: no token anywhere in the browser. The session is an httpOnly
 * cookie only the Worker reads (ADR 0003); nothing in script-visible storage,
 * and no request carries an Authorization header.
 */
import { expect, test } from '@playwright/test'
import { signIn, todayLoaded } from './support.ts'

test('no credential reaches JavaScript or a request header', async ({ page, context }) => {
  const authorised: string[] = []
  page.on('request', request => {
    if (request.headers().authorization) authorised.push(request.url())
  })
  await signIn(page)
  await todayLoaded(page)

  const cookies = await context.cookies()
  expect(cookies.map(c => [c.name, c.httpOnly, c.secure, c.sameSite])).toEqual([['__Host-hecate-session', true, true, 'Strict']])
  const visible = await page.evaluate(() => ({
    cookie: document.cookie,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }))
  expect(visible.cookie).toBe('')
  expect(visible.session).toEqual([])
  expect(visible.local).toEqual([['hecate:workspace', 'planning']])
  expect(authorised).toEqual([])

  // The device copy (ADR 0009) holds the workspace, never the session's token.
  const stored = async () => page.evaluate(
    () =>
      new Promise<Record<string, string>>((resolve, reject) => {
        const open = indexedDB.open('hecate')
        open.onerror = () => reject(open.error ?? new Error('no database'))
        open.onsuccess = () => {
          const db = open.result
          const names = [...db.objectStoreNames]
          const out: Record<string, string> = {}
          const tx = db.transaction(names)
          for (const name of names) {
            const all = tx.objectStore(name).getAll()
            all.onsuccess = () => void (out[name] = JSON.stringify(all.result))
          }
          tx.oncomplete = () => {
            db.close()
            resolve(out)
          }
        }
      }),
  )
  await expect.poll(async () => Object.keys(await stored()).sort()).toEqual(['batches', 'session', 'snapshots'])
  await expect.poll(async () => (await stored()).snapshots).toContain('"version"')
  const token = cookies[0]?.value ?? ''
  expect(token.length).toBeGreaterThan(20)
  for (const [name, json] of Object.entries(await stored())) expect(json.includes(token), name).toBe(false)
})
