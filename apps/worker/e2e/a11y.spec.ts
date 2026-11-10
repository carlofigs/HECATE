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

test('Board', async ({ page }) => {
  await signIn(page, '/w/planning/board')
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await expect(page.getByRole('article').first()).toBeVisible()
  await scan(page, 'Board')
})

test('Board, with the Move menu open', async ({ page }) => {
  await signIn(page, '/w/planning/board')
  await page.getByRole('button', { name: 'Move A2' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await scan(page, 'Board (Move menu)')
})

test('the task editor, showing its errors', async ({ page }) => {
  // Signed in first: an open dialog hides the page (and its h1) from the accessibility tree.
  await signIn(page, '/w/planning/board')
  await page.goto('/w/planning/board?new=1')
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await scan(page, 'task editor (errors)')
})

test('the delete confirmation', async ({ page }) => {
  await signIn(page, '/w/planning/board')
  await page.goto('/w/planning/board?task=A3')
  await page.getByRole('dialog', { name: 'Edit A3' }).getByRole('button', { name: 'Delete task' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await scan(page, 'delete confirmation')
})

test('the Today item editor, showing its errors', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.getByRole('region', { name: 'Plan for today' }).getByRole('button', { name: 'Add to plan' }).click()
  const dialog = page.getByRole('dialog', { name: "Add to today's plan" })
  await dialog.getByRole('button', { name: 'Add to plan' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await scan(page, 'Today item editor (errors)')
})

test('closing the day', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.getByRole('region', { name: 'Plan for today' }).getByRole('button', { name: 'Close the day' }).click()
  const dialog = page.getByRole('dialog', { name: 'Close Wed 11 Nov' })
  await dialog.getByRole('group', { name: 'Finish the scorecard draft' }).getByRole('radio', { name: 'Done' }).check()
  await dialog.getByRole('button', { name: 'Add something else' }).click()
  await expect(dialog.getByRole('checkbox', { name: 'Also complete A1' })).toBeVisible()
  await scan(page, 'close the day')
})

test('Today, with an item menu open', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.getByRole('button', { name: 'More for “Clear the inbox”' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await scan(page, 'Today (item menu)')
})

test('Projects', async ({ page }) => {
  await signIn(page, '/w/studio/projects')
  await expect(page.getByRole('heading', { level: 2, name: 'Closed' })).toBeVisible()
  await scan(page, 'Projects')
})

test('a project, with archived tasks', async ({ page }) => {
  await signIn(page, '/w/studio/projects/website')
  await expect(page.getByRole('heading', { level: 3, name: 'Archived in sprint 6' })).toBeVisible()
  await scan(page, 'a project')
})

test('the project editor, showing its errors', async ({ page }) => {
  await signIn(page, '/w/planning/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await scan(page, 'project editor (errors)')
})

test('a project’s item editor, resolving a question', async ({ page }) => {
  await signIn(page, '/w/studio/projects/website')
  await page.getByRole('button', { name: 'Edit “OQ-01”' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit OQ-01' })
  await dialog.getByRole('radio', { name: 'Resolved' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await scan(page, 'project item editor (errors)')
})
