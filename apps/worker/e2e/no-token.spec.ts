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
})
