/**
 * Live updates (P6: "two open tabs converge within 2 s"). Each test opens
 * two tabs on its own copy of Planning; a change in one, or from another
 * writer, must reach the other over its live socket, well inside the 60 s
 * poll that is now only the fallback.
 *
 * Planning: To Do A2, B1 · In Progress A1, A5 · Backlog A3 · Done A4.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { claimWorkspace, columnKeys, isTouch, NOW, signIn } from './support.ts'

/** Converged: the P6 acceptance line. */
const LIVE = { timeout: 2_000 }

const column = (page: Page, status: string) => page.locator('section', { has: page.getByRole('heading', { level: 2, name: new RegExp(`^${status}`) }) })

async function show(page: Page, status: string): Promise<void> {
  if (isTouch()) await page.getByRole('tab', { name: new RegExp(`^${status}`) }).click()
}

/** A second tab in the same browser, on `path`, once its live socket is open. */
async function secondTab(context: BrowserContext, path: string, heading: string): Promise<Page> {
  const other = await context.newPage()
  await other.clock.setFixedTime(NOW)
  await other.goto(path)
  await expect(other.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await live(other)
  return other
}

/** Live, the sync status says only "Up to date": the time belongs to the poll. */
async function live(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /^Up to date$/ })).toBeVisible()
}

async function twoBoards(page: Page, context: BrowserContext): Promise<{ dir: string; other: Page }> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board`)
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await live(page)
  return { dir, other: await secondTab(context, `/w/${dir}/board`, 'Board') }
}

test('two tabs on one workspace show each other’s changes within 2 s', async ({ page, context }) => {
  const { other } = await twoBoards(page, context)

  await show(page, 'In Progress')
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await show(other, 'Done')
  await expect.poll(() => columnKeys(other, 'Done'), LIVE).toContain('A1')

  await show(other, 'Backlog')
  await column(other, 'Backlog').getByRole('button', { name: 'Add task' }).click()
  await column(other, 'Backlog').getByLabel('New task in Backlog').fill('Write the release notes')
  await other.keyboard.press('Enter')
  await show(page, 'Backlog')
  await expect(column(page, 'Backlog').getByRole('article', { name: /^A6 / })).toBeVisible(LIVE)
  await expect(column(page, 'Backlog')).toContainText('Write the release notes')
})

test('a change from another writer appears without a reload', async ({ page }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board`)
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await live(page)

  // Another device, or Claude: the same Worker, a batch this tab never made.
  const origin = new URL(page.url()).origin
  const sent = await page.request.post(`/api/workspaces/${encodeURIComponent(dir)}/ops`, {
    headers: { origin, 'content-type': 'application/json' },
    data: { ops: [{ type: 'task.add', kind: 'action', title: 'Added somewhere else', status: 'backlog' }] },
  })
  expect(sent.ok()).toBe(true)
  await show(page, 'Backlog')
  await expect(column(page, 'Backlog')).toContainText('Added somewhere else', LIVE)
})

test('marking activity read in one tab clears the count in the other', async ({ page, context }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/activity`)
  await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible()
  await live(page)
  const other = await secondTab(context, `/w/${dir}/more`, 'More')
  const activityLink = other.getByRole('navigation', { name: 'More pages' }).getByRole('link', { name: /^Activity/ })
  await expect(activityLink).toHaveText(/7\s*new/)

  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0)
  await expect(activityLink).not.toHaveText(/\d+\s*new/, LIVE)
})
