/**
 * R-29 layer 1: an automated scan with zero violations, on every surface, at
 * every width, in both schemes. Layers 2 and 3 (a keyboard-only pass and a
 * screen-reader pass) are partly covered by layout.spec.ts and otherwise
 * manual; this file claims only the scan.
 */
import { expect, test } from '@playwright/test'
import { NOW, scan, signIn, todayLoaded } from './support.ts'

test('sign-in', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await scan(page, 'sign-in')
})

test('Today, populated', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await scan(page, 'Today (populated)')
})

test('Today, empty', async ({ page }) => {
  await signIn(page, '/w/club/today')
  await expect(page.getByText('Nothing on the calendar today.')).toBeVisible()
  await scan(page, 'Today (empty)')
})

test('Today, failed to load', async ({ page }) => {
  await page.route('**/api/workspaces/planning', route => route.fulfill({ status: 503, json: { status: 'unavailable', message: 'GitHub did not answer' } }))
  await signIn(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await scan(page, 'Today (error)')
})

test('not found', async ({ page }) => {
  await signIn(page, '/nowhere')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await scan(page, 'not found')
})
