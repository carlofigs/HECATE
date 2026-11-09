import { expect, test } from '@playwright/test'
import { NOW, signIn, todayLoaded } from './support.ts'

test('signed out, the app offers one way in', async ({ page }) => {
  await page.clock.setFixedTime(NOW)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to HECATE' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute('href', '/auth/login?back=%2F')
})

test('signing in opens the default workspace on Today', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/w\/planning\/today$/)
  await todayLoaded(page)
})

test('signing in from a deep link comes back to it', async ({ page }) => {
  await signIn(page, '/w/club/today')
  await expect(page).toHaveURL(/\/w\/club\/today$/)
  await expect(page.getByRole('heading', { level: 2, name: 'In progress' })).toBeVisible()
})

test('signing out ends the session for good', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to HECATE' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to HECATE' })).toBeVisible()
})
