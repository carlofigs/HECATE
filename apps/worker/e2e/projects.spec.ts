/**
 * Projects (P5: "projects show linked tasks by projectId, including archived
 * ones"). Reading uses Studio, where sprint 6 has closed; writing uses a
 * private copy of Planning, each change followed into git.
 *
 * Studio's "Website refresh": A1 done and A2 dropped in sprint 6 (archived),
 * A3 in progress, A4 to do, A5 done on the board. "Newsletter" is closed.
 * Planning's "Scorecard": A1 and A2, a hard deadline on Fri 13 Nov, and a
 * cutoff for the finance team.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, committed, signIn, stored } from './support.ts'

interface Project {
  id: string
  status: string
  phase: string | null
  nextActions: { id: string; text: string }[]
  deadlines: { title: string; hard: boolean; date: string }[]
  cutoffs: { who: string; what: string }[]
  openQuestions: { id: string; n: number; question: string; blocker: boolean; status: string; resolution: string | null }[]
}

const region = (page: Page, name: string): Locator => page.getByRole('region', { name })
const toast = (page: Page, title: string): Locator => page.getByRole('status').filter({ hasText: title })
/** A section's items in screen order, by their Edit buttons. */
const items = (where: Locator): Promise<string[]> =>
  where.getByRole('button', { name: /^Edit “/ }).evaluateAll(buttons => buttons.map(b => (b.getAttribute('aria-label') ?? '').slice(6, -1)))

async function openScorecard(page: Page): Promise<string> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/projects/scorecard`)
  await expect(page.getByRole('heading', { level: 1, name: 'Scorecard' })).toBeVisible()
  return dir
}

test('the list shows each project with what needs attention, live ones first, and opens one', async ({ page }) => {
  await signIn(page, '/w/studio/projects')
  const live = region(page, 'Live')
  await expect(live.getByRole('link', { name: 'Website refresh' })).toBeVisible()
  await expect(live).toContainText('Active')
  await expect(live).toContainText('2 open tasks')
  await expect(live).toContainText('1 open question, 1 blocking')
  await expect(live).toContainText('Next deadline Fri 20 Nov: Launch')
  await expect(region(page, 'Closed').getByRole('link', { name: 'Newsletter' })).toBeVisible()

  await live.getByRole('link', { name: 'Website refresh' }).click()
  await expect(page).toHaveURL(/\/w\/studio\/projects\/website$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Website refresh' })).toBeVisible()
  await page.getByRole('link', { name: 'Projects', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
})

test('a project shows every linked task, archived ones under the sprint that closed them', async ({ page }) => {
  await signIn(page, '/w/studio/projects/website')
  const tasks = region(page, 'Tasks')
  await expect(tasks.getByRole('heading', { level: 3 })).toHaveText(['Open', 'Finished, still on the board', 'Archived in sprint 6'])
  // Board order: the workspace's statuses run To Do, In Progress, Done.
  await expect(tasks.getByRole('link')).toHaveText(['Choose a theme', 'Write the copy', 'Collect photos'])
  // Archived tasks are a record: shown, never linked, since the Board no longer holds them.
  await expect(tasks.getByText('Audit the old pages')).toBeVisible()
  await expect(tasks.getByText('Migrate the blog')).toBeVisible()
  await expect(tasks.getByRole('link', { name: 'Audit the old pages' })).toHaveCount(0)

  const overview = region(page, 'Overview')
  await expect(overview).toContainText('Phase: Build')
  await expect(overview).toContainText('Owner: Design team')
  await expect(overview).toContainText('WEB-12')
  await expect(region(page, 'Timeline')).toContainText('Discovery')
  await expect(region(page, 'Notes')).toContainText('Keep every page light.')
  await expect(region(page, 'Deadlines').getByText('Overdue')).toBeVisible()
  await expect(region(page, 'Open questions')).toContainText('Archive it.')

  await tasks.getByRole('link', { name: 'Write the copy' }).click()
  await expect(page).toHaveURL(/\/w\/studio\/projects\/website\?task=A3$/)
  await expect(page.getByRole('dialog', { name: 'Edit A3' })).toBeVisible()
})

test('a project that does not exist says so', async ({ page }) => {
  await signIn(page, '/w/studio/projects/nope')
  await expect(page.getByRole('heading', { name: 'No project “nope”' })).toBeVisible()
  await page.getByRole('link', { name: 'All projects' }).click()
  await expect(page).toHaveURL(/\/w\/studio\/projects$/)
})

test('switching workspace keeps the Projects section', async ({ page }) => {
  await signIn(page, '/w/studio/projects/website')
  await expect(page.getByRole('heading', { level: 1, name: 'Website refresh' })).toBeVisible()
  await page.getByLabel('Workspace').selectOption('planning')
  await expect(page).toHaveURL(/\/w\/planning\/projects$/)
  await expect(region(page, 'Live').getByRole('link', { name: 'Scorecard' })).toBeVisible()
})

test('creating a project suggests its address from the name and opens it', async ({ page }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/projects`)
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel(/^Name/).fill('Team offsite')
  await expect(dialog.getByLabel(/^Address/)).toHaveValue('team-offsite')
  await dialog.getByLabel('Status').selectOption('planned')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page).toHaveURL(new RegExp(`/w/${dir}/projects/team-offsite$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Team offsite' })).toBeVisible()
  expect(stored<Project>((await committed(page, dir)).files, 'projects/team-offsite.json')).toMatchObject({ status: 'planned' })
})

test('editing the overview changes only what was edited', async ({ page }) => {
  const dir = await openScorecard(page)
  await region(page, 'Overview').getByRole('button', { name: 'Edit overview' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Scorecard' })
  await dialog.getByLabel('Status').selectOption('paused')
  await dialog.getByLabel(/^Phase/).fill('Build')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Updated Scorecard')).toBeVisible()
  await expect(region(page, 'Overview')).toContainText('Phase: Build')

  const project = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json')
  expect(project).toMatchObject({ status: 'paused', phase: 'Build', deadlines: [{ title: 'Scorecard review', hard: true }] })
})

test('next actions: add, move, and remove with Undo, keeping every id', async ({ page }) => {
  const dir = await openScorecard(page)
  const actions = region(page, 'Next actions')
  for (const text of ['Collect the numbers', 'Book the review']) {
    await actions.getByRole('button', { name: 'Add a next action' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a next action' })
    await dialog.getByLabel(/^Action/).fill(text)
    await dialog.getByRole('button', { name: 'Add action' }).click()
    await expect(dialog).toHaveCount(0)
  }
  await expect.poll(() => items(actions)).toEqual(['Collect the numbers', 'Book the review'])
  const before = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json').nextActions

  await actions.getByRole('button', { name: 'More for “Book the review”' }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await expect.poll(() => items(actions)).toEqual(['Book the review', 'Collect the numbers'])
  await actions.getByRole('button', { name: 'More for “Collect the numbers”' }).click()
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  await expect.poll(() => items(actions)).toEqual(['Book the review'])
  await page.getByRole('listitem').filter({ hasText: 'Removed from the next actions' }).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => items(actions)).toEqual(['Book the review', 'Collect the numbers'])

  const after = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json').nextActions
  expect(after.map(a => a.text)).toEqual(['Book the review', 'Collect the numbers'])
  expect(after.map(a => a.id)).toEqual([before[1]?.id, before[0]?.id])
})

test('an open question keeps its number through being resolved and reopened', async ({ page }) => {
  const dir = await openScorecard(page)
  const questions = region(page, 'Open questions')
  await questions.getByRole('button', { name: 'Add an open question' }).click()
  const add = page.getByRole('dialog', { name: 'Add an open question' })
  await add.getByLabel(/^Question/).fill('Who signs off the scorecard?')
  await add.getByRole('checkbox', { name: 'Blocks the project' }).check()
  await add.getByRole('button', { name: 'Add question' }).click()
  await expect(questions.getByText('Blocker')).toBeVisible()

  await questions.getByRole('button', { name: 'Edit “OQ-01”' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit OQ-01' })
  await edit.getByRole('radio', { name: 'Resolved' }).check()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit.getByLabel(/^Resolution/)).toHaveAccessibleDescription(/Say how it was resolved\./)
  await edit.getByLabel(/^Resolution/).fill('Sam signs it off.')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(questions.getByText('Resolved')).toBeVisible()

  const resolved = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json').openQuestions
  expect(resolved).toMatchObject([{ n: 1, status: 'resolved', resolution: 'Sam signs it off.', blocker: true }])

  await questions.getByRole('button', { name: 'Edit “OQ-01”' }).click()
  await page.getByRole('dialog', { name: 'Edit OQ-01' }).getByRole('radio', { name: 'Open' }).check()
  await page.getByRole('dialog', { name: 'Edit OQ-01' }).getByRole('button', { name: 'Save' }).click()
  await expect(questions.getByText('Open', { exact: true })).toBeVisible()
  const reopened = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json').openQuestions
  expect(reopened).toMatchObject([{ id: resolved[0]?.id, n: 1, status: 'open', resolution: null }])
})

test('a new deadline reaches Today, and a cutoff can be added and removed', async ({ page }) => {
  const dir = await openScorecard(page)
  await region(page, 'Deadlines').getByRole('button', { name: 'Add a deadline' }).click()
  const deadline = page.getByRole('dialog', { name: 'Add a deadline' })
  await deadline.getByLabel(/^Title/).fill('Draft to finance')
  await deadline.getByLabel(/^Date/).fill('2026-11-16')
  await deadline.getByRole('checkbox', { name: 'Hard deadline' }).check()
  await deadline.getByRole('button', { name: 'Add deadline' }).click()
  await expect(region(page, 'Deadlines').getByText('Draft to finance')).toBeVisible()

  const cutoffs = region(page, 'Cutoffs')
  await cutoffs.getByRole('button', { name: 'Add a cutoff' }).click()
  const cutoff = page.getByRole('dialog', { name: 'Add a cutoff' })
  await cutoff.getByLabel(/^Date/).fill('2026-11-19')
  await cutoff.getByLabel(/^Who/).fill('Legal')
  await cutoff.getByLabel(/^What closes/).fill('Contract review')
  await cutoff.getByRole('button', { name: 'Add cutoff' }).click()
  await expect(cutoffs.getByText('Contract review')).toBeVisible()
  await cutoffs.getByRole('button', { name: 'Remove “Legal: Contract review”' }).click()
  await expect(cutoffs.getByText('Contract review')).toHaveCount(0)

  const project = stored<Project>((await committed(page, dir)).files, 'projects/scorecard.json')
  expect(project.deadlines.map(d => [d.title, d.hard])).toEqual([['Scorecard review', true], ['Draft to finance', true]])
  expect(project.cutoffs.map(c => c.who)).toEqual(['Finance team'])

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
  await expect(region(page, 'Due soon')).toContainText('Draft to finance')
})

test('a new task started from a project belongs to it', async ({ page }) => {
  const dir = await openScorecard(page)
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await expect(dialog.getByLabel('Project')).toHaveValue('scorecard')
  await dialog.getByLabel(/^Title/).fill('Book the review room')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(region(page, 'Tasks').getByRole('link', { name: 'Book the review room' })).toBeVisible()

  const git = await committed(page, dir)
  const project = stored<Project>(git.files, 'projects/scorecard.json')
  const task = stored<{ tasks: { title: string; projectId: string | null }[] }>(git.files, 'tasks.json').tasks.find(t => t.title === 'Book the review room')
  expect(task?.projectId).toBe(project.id)
})
