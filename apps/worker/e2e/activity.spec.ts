/**
 * The activity log through the app's own reader (ADR 0002). Planning's log is
 * its seed (six "Added …" events, imported) and a flag from Claude, all on
 * Tue 10 Nov and all new to the app. Writing tests use a private copy, since
 * marking as read moves the app's marker for that workspace.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, committed, isTouch, signIn } from './support.ts'

const region = (page: Page, name: string): Locator => page.getByRole('region', { name })

async function openActivity(page: Page): Promise<string> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/activity`)
  await expect(page.getByText('7 new since you last looked')).toBeVisible()
  return dir
}

test('the log shows what happened by day, newest first, with what is new since you last looked', async ({ page }) => {
  await signIn(page, '/w/planning/activity')
  await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible()
  await expect(page.getByText('7 new since you last looked')).toBeVisible()
  const day = region(page, 'Tue 10 Nov')
  const flag = day.getByRole('listitem').filter({ hasText: 'Scorecard review moved to Friday' })
  await expect(flag).toContainText('Claude')
  await expect(flag).toContainText('Flag')
  await expect(flag).toContainText('New')
  await expect(day.getByRole('listitem').first()).toContainText('Scorecard review moved to Friday')
  await expect(day.getByRole('listitem').filter({ hasText: 'Added A1 — Draft the scorecard' })).toContainText('Import')
  await expect(day.getByText('New', { exact: true })).toHaveCount(7)
  if (!isTouch()) await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Activity\s*7 new$/ })).toBeVisible()
})

test('marking all as read clears what is new, and it stays read', async ({ page }) => {
  const dir = await openActivity(page)
  await page.route('**/activity/ack', async route => {
    await new Promise(resolve => setTimeout(resolve, 600))
    await route.continue()
  })
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  // R-25: it says so while the Worker answers.
  await expect(page.getByRole('button', { name: 'Marking as read…' })).toBeVisible()
  await expect(page.getByText('Nothing new since you last looked')).toBeVisible()
  await expect(page.getByText('New', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Nothing new since you last looked')).toBeVisible()
  if (!isTouch()) await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Activity', exact: true })).toBeVisible()
  // Reading is not a change to the data: nothing is waiting to be committed.
  expect((await committed(page, dir)).log.filter(m => m.startsWith(`${dir}: `))).toEqual([])
})

test('your own changes appear in the log, never as new to you', async ({ page }) => {
  const dir = await openActivity(page)
  await page.goto(`/w/${dir}/board`)
  if (isTouch()) await page.getByRole('tab', { name: /^In Progress/ }).click()
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Completed A1' })).toBeVisible()
  await committed(page, dir)

  await page.goto(`/w/${dir}/activity`)
  const mine = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Completed A1 — Draft the scorecard' })
  await expect(mine).toContainText('You')
  await expect(mine.getByText('New', { exact: true })).toHaveCount(0)
  await expect(page.getByText('7 new since you last looked')).toBeVisible()
})

test('adding to the log writes one entry, as the hecate-log skill does', async ({ page }) => {
  const dir = await openActivity(page)
  await page.getByRole('main').getByRole('button', { name: 'Add to log' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add to the log' })
  await dialog.getByRole('button', { name: 'Add to log' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Say what happened, in a line.')
  await dialog.getByLabel(/^What happened/).fill('Backlog tidy-up booked for Monday')
  await dialog.getByLabel('Tasks').fill('a3')
  await dialog.getByRole('button', { name: 'Add to log' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added to the log' })).toBeVisible()

  const entry = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Backlog tidy-up booked for Monday' })
  await expect(entry).toContainText('You')
  await expect(entry).toContainText('Flag')
  const git = await committed(page, dir)
  const logs = Object.entries(git.files).filter(([path]) => path.startsWith('activity/')).map(([, text]) => text).join('')
  const written = logs.split('\n').filter(Boolean).map(l => JSON.parse(l) as { actor: string; type: string; delta: string; keys: string[] })
  expect(written.find(e => e.delta === 'Backlog tidy-up booked for Monday')).toMatchObject({ actor: 'app', type: 'flag', keys: ['A3'] })
})
