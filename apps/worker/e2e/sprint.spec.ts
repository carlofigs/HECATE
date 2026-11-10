/**
 * The sprint (P5: "close sprint is a single commit, revertible with git
 * revert"). Reading uses Planning (day 8 of sprint 7, never started) and
 * Studio (sprint 6 closed with a goal and a retro); closing uses a private
 * copy of Planning, followed into git.
 *
 * Planning's sprint 7: A4 is done, A1 and A5 are in progress.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, committed, isTouch, signIn, stored } from './support.ts'

interface Sprint {
  goal: string | null
  retro: string | null
  closedAt: string | null
  done: { key: string }[]
  carried: string[]
  velocity: { done: number; carried: number; dropped: number } | null
}

const region = (page: Page, name: string): Locator => page.getByRole('region', { name })
const toast = (page: Page, title: string): Locator => page.getByRole('status').filter({ hasText: title })

test('the current sprint shows what closing it would archive and carry', async ({ page }) => {
  await signIn(page, '/w/planning/sprint')
  await expect(page.getByRole('heading', { level: 1, name: 'Sprint 7' })).toBeVisible()
  await expect(page.getByText('Wed 4 Nov – Tue 17 Nov · day 8 of 14 · closes Tue 17 Nov')).toBeVisible()
  const tasks = region(page, 'Tasks')
  await expect(tasks.getByRole('heading', { level: 3 })).toHaveText(['Done: moves to the archive at close (1)', 'In progress: carried at close (2)'])
  await expect(tasks.getByRole('link')).toHaveText(['Review the dashboard', 'Draft the scorecard', 'Plan the team offsite'])
  await expect(region(page, 'Goal')).toContainText('No goal set.')
  await expect(region(page, 'All sprints')).toContainText('Sprint 7 (this page)')

  await tasks.getByRole('link', { name: 'Draft the scorecard' }).click()
  await expect(page).toHaveURL(/\/w\/planning\/board\?task=A1$/)
})

test('a closed sprint is a record: its goal, retro and archived tasks', async ({ page }) => {
  await signIn(page, '/w/studio/sprint')
  const all = region(page, 'All sprints')
  await expect(all).toContainText('1 done · 0 carried · 1 dropped')
  await all.getByRole('link', { name: 'Sprint 6' }).click()

  await expect(page).toHaveURL(/\/w\/studio\/sprint\/6$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sprint 6' })).toBeVisible()
  await expect(page.getByText('Wed 21 Oct – Tue 3 Nov · Closed Tue 10 Nov')).toBeVisible()
  await expect(region(page, 'Goal')).toContainText('Audit the old site.')
  await expect(region(page, 'Retro')).toContainText('the blog was not worth moving')
  const tasks = region(page, 'Tasks')
  await expect(tasks.getByRole('heading', { level: 3 })).toHaveText(['Done (1)', 'Dropped (1)'])
  await expect(tasks.getByText('Audit the old pages')).toBeVisible()
  await expect(tasks.getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Review and close' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Current sprint' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sprint 7' })).toBeVisible()
})

test('a workspace without a sprint cadence says so', async ({ page }) => {
  await signIn(page, '/w/club/sprint')
  await expect(page.getByRole('heading', { name: 'This workspace has no sprints' })).toBeVisible()
})

test('closing the sprint archives what the review showed, as one commit of its own', async ({ page }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/sprint`)

  // A goal set just before closing: still pending when the close arrives.
  await region(page, 'Goal').getByRole('button', { name: 'Set the goal' }).click()
  const goal = page.getByRole('dialog', { name: 'Sprint 7: goal' })
  await goal.getByLabel('Goal').fill('Ship the scorecard.')
  await goal.getByRole('button', { name: 'Save' }).click()
  await expect(region(page, 'Goal')).toContainText('Ship the scorecard.')

  await page.getByRole('button', { name: 'Review and close' }).click()
  const close = page.getByRole('dialog', { name: 'Close sprint 7' })
  await expect(close.getByRole('alert').or(close.getByRole('status')).filter({ hasText: 'Sprint 7 runs until Tue 17 Nov' })).toBeVisible()
  await expect(close.getByRole('heading', { level: 3 })).toHaveText(['Done, to the archive (1)', 'Dropped, to the archive (0)', 'Carried, still in progress (2)'])
  await expect(close.getByText('Review the dashboard')).toBeVisible()
  await close.getByLabel('Retro').fill('Steady.')
  await close.getByRole('button', { name: 'Close sprint 7' }).click()

  await expect(toast(page, 'Closed sprint 7')).toContainText('1 done · 2 carried · 0 dropped')
  await expect(page.getByText(/Wed 4 Nov – Tue 17 Nov · Closed/)).toBeVisible()
  await expect(region(page, 'Tasks').getByRole('heading', { level: 3 })).toHaveText(['Done (1)', 'Carried (2)'])
  await expect(page.getByRole('button', { name: 'Review and close' })).toHaveCount(0)

  const git = await committed(page, dir)
  const sprint = stored<Sprint>(git.files, 'sprints/7.json')
  expect(sprint).toMatchObject({ goal: 'Ship the scorecard.', retro: 'Steady.', carried: ['A1', 'A5'], velocity: { done: 1, carried: 2, dropped: 0 } })
  expect(sprint.closedAt).not.toBeNull()
  expect(sprint.done.map(t => t.key)).toEqual(['A4'])
  expect(git.tasks.map(t => t.key)).not.toContain('A4')
  // The acceptance check: the close is the newest commit for this workspace, and holds nothing else.
  const mine = git.log.filter(m => m.startsWith(`${dir}: `))
  expect(mine[0]).toMatch(new RegExp(`^${dir}: Close sprint 7 `))
  expect(mine[0]?.split('\n').filter(l => l.startsWith('- '))).toHaveLength(1)
  expect(mine.slice(1).some(m => m.includes('Start sprint 7'))).toBe(true)

  await page.goto(`/w/${dir}/board`)
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await expect(page.getByRole('article', { name: /^A4 / })).toHaveCount(0)
})

test('the retro can be written after the sprint has closed', async ({ page }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/sprint`)
  await page.getByRole('button', { name: 'Review and close' }).click()
  await page.getByRole('dialog', { name: 'Close sprint 7' }).getByRole('button', { name: 'Close sprint 7' }).click()
  await expect(toast(page, 'Closed sprint 7')).toBeVisible()

  await region(page, 'Retro').getByRole('button', { name: 'Write the retro' }).click()
  const retro = page.getByRole('dialog', { name: 'Sprint 7: retro' })
  await retro.getByLabel('Retro').fill('The review slipped a day.')
  await retro.getByRole('button', { name: 'Save' }).click()
  await expect(region(page, 'Retro')).toContainText('The review slipped a day.')
  expect(stored<Sprint>((await committed(page, dir)).files, 'sprints/7.json')).toMatchObject({ retro: 'The review slipped a day.' })
})

test('More lists the pages the phone bar has no room for', async ({ page }) => {
  await signIn(page, '/w/planning/more')
  const more = page.getByRole('navigation', { name: 'More pages' })
  await expect(more.getByRole('link')).toHaveText([/^Projects/, /^Sprint/])
  if (isTouch()) {
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
  } else {
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sprint' })).toBeVisible()
  }
  await more.getByRole('link', { name: /^Sprint/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sprint 7' })).toBeVisible()
})
