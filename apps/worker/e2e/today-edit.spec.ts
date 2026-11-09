/**
 * Editing Today (P5: "Today is editable, including end-of-day outcomes"),
 * each test on its own copy of Planning, each change followed into git.
 *
 * Planning's Wed 11 Nov plan: "Finish the scorecard draft" (A1, high) and
 * "Clear the inbox". The week: a callout "Sprint review on Tuesday." and
 * priorities Focus "Ship the scorecard", Next "Plan the offsite", Ongoing
 * "Keep the backlog tidy". Keep in mind: "Leave".
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, committed, signIn, stored, todayLoaded } from './support.ts'

const WEEK = 'focus/2026-11-09.json'
const TODAY = '2026-11-11'

interface PlanItem { id: string; lead: string; urgency: string | null; keys: string[] }
interface Outcome { id: string; planItemId: string | null; result: string; lead: string; note: string | null }
interface Week {
  days: { date: string; plan: PlanItem[]; outcomes: Outcome[]; closedAt: string | null; note: string | null }[]
  priorities: { id: string; tier: string; lead: string }[]
  callouts: { id: string; lead: string | null; text: string }[]
}
interface KeepInMind { items: { id: string; lead: string | null; text: string; projectId: string | null }[] }

async function openToday(page: Page): Promise<string> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/today`)
  await todayLoaded(page)
  return dir
}

const section = (page: Page, name: string): Locator => page.getByRole('region', { name })
/** The items of a section in screen order, by their Edit buttons ("Edit “Clear the inbox”"). */
const items = (where: Locator): Promise<string[]> =>
  where.getByRole('button', { name: /^Edit “/ }).evaluateAll(buttons => buttons.map(b => (b.getAttribute('aria-label') ?? '').slice(6, -1)))
const toast = (page: Page, title: string): Locator => page.getByRole('status').filter({ hasText: title })
const day = (week: Week) => week.days.find(d => d.date === TODAY)

test('the plan: add, edit, move, and remove with Undo, keeping every item’s id', async ({ page }) => {
  const dir = await openToday(page)
  const before = day(stored<Week>((await committed(page, dir)).files, WEEK))?.plan ?? []
  const plan = section(page, 'Plan for today')

  await plan.getByRole('button', { name: 'Add to plan' }).click()
  const add = page.getByRole('dialog', { name: "Add to today's plan" })
  await add.getByLabel(/^What to do/).fill('Call Sam about the targets')
  await add.getByLabel('Tasks').fill('b1')
  await add.getByRole('radio', { name: 'Medium' }).check()
  await add.getByRole('button', { name: 'Add to plan' }).click()
  await expect(toast(page, "Added to today's plan")).toBeVisible()
  await expect.poll(() => items(plan)).toEqual(['Finish the scorecard draft', 'Clear the inbox', 'Call Sam about the targets'])

  await plan.getByRole('button', { name: 'Edit “Call Sam about the targets”' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit plan item' })
  await edit.getByRole('radio', { name: 'High' }).check()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, "Updated today's plan")).toBeVisible()

  await plan.getByRole('button', { name: 'More for “Call Sam about the targets”' }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await expect.poll(() => items(plan)).toEqual(['Finish the scorecard draft', 'Call Sam about the targets', 'Clear the inbox'])

  await plan.getByRole('button', { name: 'More for “Clear the inbox”' }).click()
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  await expect.poll(() => items(plan)).toEqual(['Finish the scorecard draft', 'Call Sam about the targets'])
  await page.getByRole('listitem').filter({ hasText: "Removed from today's plan" }).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => items(plan)).toEqual(['Finish the scorecard draft', 'Call Sam about the targets', 'Clear the inbox'])

  const after = day(stored<Week>((await committed(page, dir)).files, WEEK))?.plan ?? []
  expect(after.map(p => p.lead)).toEqual(['Finish the scorecard draft', 'Call Sam about the targets', 'Clear the inbox'])
  expect(after[1]).toMatchObject({ urgency: 'high', keys: ['B1'] })
  expect([after[0]?.id, after[2]?.id]).toEqual(before.map(p => p.id))
})

test('closing the day records outcomes against the plan, completes what was asked, and can be edited', async ({ page }) => {
  const dir = await openToday(page)
  await section(page, 'Plan for today').getByRole('button', { name: 'Close the day' }).click()
  const close = page.getByRole('dialog', { name: 'Close Wed 11 Nov' })

  const draft = close.getByRole('group', { name: 'Finish the scorecard draft' })
  await expect(draft.getByRole('radio', { name: 'Carried' })).toBeChecked()
  await draft.getByRole('radio', { name: 'Done' }).check()
  await draft.getByRole('checkbox', { name: 'Also complete A1' }).check()
  await draft.getByLabel('Note').fill('Sent for review')
  await expect(close.getByRole('group', { name: 'Clear the inbox' }).getByRole('radio', { name: 'Carried' })).toBeChecked()

  await close.getByRole('button', { name: 'Add something else' }).click()
  await close.getByRole('group', { name: 'Something else 1' }).getByLabel(/^What you did/).fill('Fixed the export')
  await close.getByLabel('How the day went').fill('Good progress.')
  await close.getByRole('button', { name: 'Close the day' }).click()

  await expect(toast(page, 'Closed Wed 11 Nov')).toBeVisible()
  const went = section(page, 'How today went')
  await expect(went.getByText('Fixed the export')).toBeVisible()
  await expect(went.getByText('Good progress.')).toBeVisible()
  await expect(section(page, 'Plan for today')).toHaveCount(0)
  await expect(section(page, 'In progress').getByRole('link', { name: 'Draft the scorecard' })).toHaveCount(0)

  const first = await committed(page, dir)
  const closed = day(stored<Week>(first.files, WEEK))
  expect(closed?.closedAt).not.toBeNull()
  expect(closed?.note).toBe('Good progress.')
  const plan = closed?.plan ?? []
  expect(closed?.outcomes.map(o => [o.planItemId, o.result, o.lead, o.note])).toEqual([
    [plan[0]?.id, 'done', 'Finish the scorecard draft', 'Sent for review'],
    [plan[1]?.id, 'carried', 'Clear the inbox', null],
    [null, 'done', 'Fixed the export', null],
  ])
  expect(first.tasks.find(t => t.key === 'A1')?.completedAt).not.toBeNull()

  await went.getByRole('button', { name: 'Edit how today went' }).click()
  const again = page.getByRole('dialog', { name: 'Edit how Wed 11 Nov went' })
  await expect(again.getByRole('group', { name: 'Finish the scorecard draft' }).getByRole('radio', { name: 'Done' })).toBeChecked()
  await again.getByRole('group', { name: 'Clear the inbox' }).getByRole('radio', { name: 'Dropped' }).check()
  await again.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Updated how Wed 11 Nov went')).toBeVisible()

  const edited = day(stored<Week>((await committed(page, dir)).files, WEEK))
  expect(edited?.outcomes.map(o => o.result)).toEqual(['done', 'dropped', 'done'])
  expect(edited?.outcomes.map(o => o.id)).toEqual(closed?.outcomes.map(o => o.id))
})

test('this week: add a priority, move it within its tier, and edit a callout', async ({ page }) => {
  const dir = await openToday(page)
  const week = section(page, 'This week')

  await week.getByRole('button', { name: 'Add a priority' }).click()
  const add = page.getByRole('dialog', { name: 'Add a priority' })
  await add.getByRole('radio', { name: 'Next' }).check()
  await add.getByLabel(/^Priority/).fill('Book the venue')
  await add.getByRole('button', { name: 'Add priority' }).click()
  await expect(toast(page, 'Added a priority')).toBeVisible()

  await week.getByRole('button', { name: 'More for “Book the venue”' }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await expect.poll(() => items(week)).toEqual(['Sprint review on Tuesday.', 'Ship the scorecard', 'Book the venue', 'Plan the offsite', 'Keep the backlog tidy'])
  await week.getByRole('button', { name: 'More for “Book the venue”' }).click()
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
  await page.keyboard.press('Escape')

  await week.getByRole('button', { name: 'Edit “Sprint review on Tuesday.”' }).click()
  const callout = page.getByRole('dialog', { name: 'Edit callout' })
  await callout.getByLabel(/^Callout/).fill('Bring the final numbers.')
  await callout.getByRole('button', { name: 'Save' }).click()
  await expect(week.getByText('Bring the final numbers.')).toBeVisible()

  const saved = stored<Week>((await committed(page, dir)).files, WEEK)
  // Moving within a tier swaps the two priorities; the file keeps the tiers interleaved as they were.
  expect(saved.priorities.filter(p => p.tier === 'next').map(p => p.lead)).toEqual(['Book the venue', 'Plan the offsite'])
  expect(saved.priorities.map(p => p.lead)).toEqual(['Ship the scorecard', 'Book the venue', 'Keep the backlog tidy', 'Plan the offsite'])
  expect(saved.callouts).toMatchObject([{ lead: 'Sprint review on Tuesday.', text: 'Bring the final numbers.' }])
})

test('keep in mind: add with a project, edit, and remove after confirming', async ({ page }) => {
  const dir = await openToday(page)
  const keep = section(page, 'Keep in mind')

  await keep.getByRole('button', { name: 'Add to keep in mind' }).click()
  const add = page.getByRole('dialog', { name: 'Add to keep in mind' })
  await add.getByLabel(/^Heading/).fill('Room')
  await add.getByLabel(/^Note/).fill('Book the big room.')
  await add.getByLabel('Project').selectOption('scorecard')
  await add.getByRole('button', { name: 'Add note' }).click()
  await expect(toast(page, 'Added to keep in mind')).toBeVisible()

  await keep.getByRole('button', { name: 'Edit “Room”' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit keep-in-mind note' })
  await expect(edit.getByLabel('Project')).toHaveValue('scorecard')
  await edit.getByLabel(/^Note/).fill('Book the boardroom.')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(keep.getByText('Book the boardroom.')).toBeVisible()

  const added = stored<KeepInMind>((await committed(page, dir)).files, 'focus/keep-in-mind.json')
  expect(added.items.map(i => [i.lead, i.text])).toEqual([['Leave', expect.any(String)], ['Room', 'Book the boardroom.']])
  expect(added.items[1]?.projectId).not.toBeNull()

  await keep.getByRole('button', { name: 'Remove “Room”' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Remove this from keep in mind?' })
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(toast(page, 'Removed from keep in mind')).toBeVisible()
  await expect(keep.getByText('Book the boardroom.')).toHaveCount(0)

  const removed = stored<KeepInMind>((await committed(page, dir)).files, 'focus/keep-in-mind.json')
  expect(removed.items.map(i => i.lead)).toEqual(['Leave'])
})

test('the editor checks before saving, and says how to fix each problem', async ({ page }) => {
  await openToday(page)
  await section(page, 'Plan for today').getByRole('button', { name: 'Add to plan' }).click()
  const add = page.getByRole('dialog', { name: "Add to today's plan" })
  await add.getByLabel('Tasks').fill('A99')
  await add.getByRole('button', { name: 'Add to plan' }).click()
  await expect(add.getByRole('alert').filter({ hasText: 'Fix these 2 things before saving' })).toBeVisible()
  await expect(add.getByLabel(/^What to do/)).toHaveAccessibleDescription(/Say what to do\./)
  await expect(add.getByLabel('Tasks')).toHaveAccessibleDescription(/There is no A99 in this workspace\./)
})

test('a refused change says why and shows the Worker’s state again', async ({ page }) => {
  await openToday(page)
  await page.route('**/ops', route => route.fulfill({ status: 422, json: { status: 'rejected', message: 'Refused', errors: [{ message: 'The week is locked' }] } }))
  const plan = section(page, 'Plan for today')
  await plan.getByRole('button', { name: 'More for “Clear the inbox”' }).click()
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  await expect(page.getByRole('status').filter({ hasText: "Couldn't remove from today's plan" })).toContainText('The week is locked')
  await expect.poll(() => items(plan)).toEqual(['Finish the scorecard draft', 'Clear the inbox'])
})
