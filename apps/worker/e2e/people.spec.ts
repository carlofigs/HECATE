/**
 * People and the glossary. Reading uses Studio (Robin, a designer away 12–13
 * November, whom B1 waits on; terms CMS and Hero) and Office (sanitised: roles
 * only); writing uses a private copy of Planning (Alex, Sam), followed into git.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, committed, signIn, stored } from './support.ts'

interface People { people: { id: string; name: string | null; role: string; notes: string | null; ooo: { start: string; end: string; note: string | null }[] }[] }
interface Glossary { terms: { term: string; aliases: string[]; meaning: string }[] }
interface Tasks { tasks: { key: string; waitingOn: { personId: string | null; text: string | null } | null }[] }
interface Project { cutoffs: { personId: string | null; who: string; what: string }[] }

const region = (page: Page, name: string): Locator => page.getByRole('region', { name })
const items = (where: Locator): Promise<string[]> =>
  where.getByRole('button', { name: /^Edit “/ }).evaluateAll(buttons => buttons.map(b => (b.getAttribute('aria-label') ?? '').slice(6, -1)))

async function scratch(page: Page): Promise<string> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/people`)
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  return dir
}

const personId = (people: People, name: string): string => people.people.find(p => p.name === name)?.id ?? ''

test('People lists everyone with their leave and what waits on them, and the glossary filters', async ({ page }) => {
  await signIn(page, '/w/studio/people')
  const people = region(page, 'People')
  await expect(people.getByRole('link', { name: 'Robin' })).toBeVisible()
  await expect(people).toContainText('Designer')
  await expect(people).toContainText('Away Thu 12 Nov – Fri 13 Nov')
  await expect(people).toContainText('Also Rob')
  await expect(people).toContainText('1 task waits on them')

  const terms = region(page, 'Glossary')
  await expect.poll(() => items(terms)).toEqual(['CMS', 'Hero'])
  await expect(terms).toContainText('Project Website refresh')
  await terms.getByLabel('Filter the glossary').fill('banner')
  await expect.poll(() => items(terms)).toEqual(['Hero'])
  await terms.getByLabel('Filter the glossary').fill('nothing like it')
  await expect(terms).toContainText('No terms match “nothing like it”.')
})

test('a person’s page shows what links to them; their tasks open on the Board', async ({ page }) => {
  await signIn(page, '/w/studio/people')
  await region(page, 'People').getByRole('link', { name: 'Robin' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Robin' })).toBeVisible()
  await expect(region(page, 'About')).toContainText('Owns the logo and the colour palette.')
  await expect(region(page, 'Leave')).toContainText('Thu 12 Nov – Fri 13 Nov')
  await expect(region(page, 'Leave')).toContainText('Workshop')
  await expect(region(page, 'Cutoffs')).toContainText('No project cutoff names them.')
  await region(page, 'Waiting on them').getByRole('link', { name: 'Final logo files' }).click()
  await expect(page).toHaveURL(/\/w\/studio\/board\?task=B1$/)
})

test('a sanitised workspace records people by role, never by name', async ({ page }) => {
  await signIn(page, '/w/office/people')
  await expect(page.getByText('This workspace is sanitised: people are recorded by role, never by name.').first()).toBeVisible()
  await expect(region(page, 'People').getByRole('link', { name: 'Team lead' })).toBeVisible()
  await page.getByRole('button', { name: 'Add person' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a person' })
  await expect(dialog.getByLabel(/^Role/)).toBeVisible()
  await expect(dialog.getByLabel(/^Name/)).toHaveCount(0)
  await expect(dialog.getByLabel(/^Aliases/)).toHaveCount(0)
})

test('adding a person opens their page, and an edit changes only what was edited', async ({ page }) => {
  const dir = await scratch(page)
  await page.getByRole('button', { name: 'Add person' }).click()
  const add = page.getByRole('dialog', { name: 'Add a person' })
  await add.getByLabel(/^Role/).fill('Analyst')
  await add.getByLabel(/^Name/).fill('Jordan')
  await add.getByRole('button', { name: 'Add person' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Jordan' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/w/${dir}/people/[0-9A-Z]{26}$`))

  await region(page, 'About').getByRole('button', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Jordan' })
  await edit.getByLabel(/^Notes/).fill('Runs the **numbers**.')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(region(page, 'About')).toContainText('Runs the numbers.')

  const jordan = stored<People>((await committed(page, dir)).files, 'people.json').people.find(p => p.name === 'Jordan')
  expect(jordan).toMatchObject({ role: 'Analyst', notes: 'Runs the **numbers**.', ooo: [] })
})

test('leave reaches Today, and removing it can be undone', async ({ page }) => {
  const dir = await scratch(page)
  await region(page, 'People').getByRole('link', { name: 'Sam' }).click()
  await region(page, 'Leave').getByRole('button', { name: 'Add leave' }).click()
  const add = page.getByRole('dialog', { name: 'Add leave for Sam' })
  await add.getByLabel(/^First day/).fill('2026-11-20')
  await add.getByLabel(/^Last day/).fill('2026-11-21')
  await add.getByLabel(/^Note/).fill('Holiday')
  await add.getByRole('button', { name: 'Add leave' }).click()
  const leave = region(page, 'Leave')
  await expect(leave).toContainText('Fri 20 Nov – Sat 21 Nov')

  await leave.getByRole('button', { name: 'Remove “Fri 20 Nov – Sat 21 Nov: Holiday”' }).click()
  await expect(leave).toContainText('No leave recorded.')
  await page.getByRole('listitem').filter({ hasText: 'Removed leave' }).getByRole('button', { name: 'Undo' }).click()
  await expect(leave).toContainText('Fri 20 Nov – Sat 21 Nov')

  const sam = stored<People>((await committed(page, dir)).files, 'people.json').people.find(p => p.name === 'Sam')
  expect(sam?.ooo).toEqual([{ start: '2026-11-20', end: '2026-11-21', note: 'Holiday' }])

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
  const cutoffs = region(page, 'Cutoffs and leave')
  await expect(cutoffs.getByRole('listitem').filter({ hasText: 'Sam' })).toContainText('Leave')
})

test('a task waiting on a person links them, and keeps them from being removed', async ({ page }) => {
  const dir = await scratch(page)
  await page.goto(`/w/${dir}/board?task=B1`)
  const editor = page.getByRole('dialog', { name: 'Edit B1' })
  await editor.getByLabel('Person').selectOption({ label: 'Sam (Product manager)' })
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toHaveCount(0)

  await page.goto(`/w/${dir}/people`)
  await region(page, 'People').getByRole('link', { name: 'Sam' }).click()
  await expect(region(page, 'Waiting on them').getByRole('link', { name: 'Targets from finance' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Sam' }).click()
  await expect(page.getByRole('dialog', { name: 'Sam is still linked' })).toContainText('B1')

  const git = await committed(page, dir)
  const sam = personId(stored<People>(git.files, 'people.json'), 'Sam')
  expect(stored<Tasks>(git.files, 'tasks.json').tasks.find(t => t.key === 'B1')?.waitingOn).toEqual({ personId: sam, text: 'Finance team' })
})

test('once the task is archived, removing the person keeps them there as text', async ({ page }) => {
  const dir = await scratch(page)
  await page.goto(`/w/${dir}/board?task=B1`)
  const editor = page.getByRole('dialog', { name: 'Edit B1' })
  await editor.getByLabel('Person').selectOption({ label: 'Sam (Product manager)' })
  await editor.getByLabel('Status').selectOption({ label: 'Done' })
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toHaveCount(0)
  // Let the change reach the Worker before the page reloads, or the sprint closes without it.
  await committed(page, dir)

  await page.goto(`/w/${dir}/sprint`)
  await page.getByRole('button', { name: 'Review and close' }).click()
  await page.getByRole('dialog', { name: 'Close sprint 7' }).getByRole('button', { name: 'Close sprint 7' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Closed sprint 7' })).toBeVisible()

  await page.goto(`/w/${dir}/people`)
  await region(page, 'People').getByRole('link', { name: 'Sam' }).click()
  await expect(region(page, 'Waiting on them')).toContainText('No open task waits on them.')
  await page.getByRole('button', { name: 'Remove Sam' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Remove Sam?' })
  await expect(confirm).toContainText('B1, archived in sprint 7, keeps “Sam” as text.')
  await confirm.getByRole('button', { name: 'Remove Sam' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()

  const git = await committed(page, dir)
  expect(stored<People>(git.files, 'people.json').people.map(p => p.name)).toEqual(['Alex'])
  const sprint = stored<{ done: Tasks['tasks'] }>(git.files, 'sprints/7.json')
  expect(sprint.done.find(t => t.key === 'B1')?.waitingOn).toEqual({ personId: null, text: 'Sam — Finance team' })
})

test('removing someone nothing refers to, after confirming', async ({ page }) => {
  const dir = await scratch(page)
  await region(page, 'People').getByRole('link', { name: 'Alex' }).click()
  await page.getByRole('button', { name: 'Remove Alex' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Remove Alex?' })
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Remove Alex' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  await expect(region(page, 'People').getByRole('link', { name: 'Alex' })).toHaveCount(0)
  expect(stored<People>((await committed(page, dir)).files, 'people.json').people.map(p => p.name)).toEqual(['Sam'])
})

test('a project cutoff can name a person, who then lists it', async ({ page }) => {
  const dir = await scratch(page)
  await page.goto(`/w/${dir}/projects/scorecard`)
  await region(page, 'Cutoffs').getByRole('button', { name: 'Edit “Finance team: Month-end close”' }).click()
  const editor = page.getByRole('dialog', { name: 'Edit cutoff' })
  await editor.getByLabel('Person').selectOption({ label: 'Alex (Data engineer)' })
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toHaveCount(0)

  await page.goto(`/w/${dir}/people`)
  await region(page, 'People').getByRole('link', { name: 'Alex' }).click()
  await expect(region(page, 'Cutoffs')).toContainText('Month-end close')
  await expect(region(page, 'Cutoffs').getByRole('link', { name: 'Scorecard' })).toBeVisible()

  const git = await committed(page, dir)
  const alex = personId(stored<People>(git.files, 'people.json'), 'Alex')
  expect(stored<Project>(git.files, 'projects/scorecard.json').cutoffs).toMatchObject([{ personId: alex, who: 'Finance team', what: 'Month-end close' }])
})

test('the glossary: add, edit, and remove with Undo', async ({ page }) => {
  const dir = await scratch(page)
  const terms = region(page, 'Glossary')
  await terms.getByRole('button', { name: 'Add a term' }).click()
  const add = page.getByRole('dialog', { name: 'Add a term' })
  await add.getByLabel(/^Term/).fill('Velocity')
  await add.getByLabel(/^Meaning/).fill('Tasks done per sprint.')
  await add.getByRole('button', { name: 'Add term' }).click()
  await expect.poll(() => items(terms)).toEqual(['Velocity'])

  await terms.getByRole('button', { name: 'Edit “Velocity”' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Velocity' })
  await edit.getByLabel(/^Aliases/).fill('throughput')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(terms).toContainText('also throughput')

  await terms.getByRole('button', { name: 'Remove “Velocity”' }).click()
  await expect(terms).toContainText('No terms yet.')
  await page.getByRole('listitem').filter({ hasText: 'Removed a term' }).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => items(terms)).toEqual(['Velocity'])

  expect(stored<Glossary>((await committed(page, dir)).files, 'glossary.json').terms).toMatchObject([{ term: 'Velocity', aliases: ['throughput'], meaning: 'Tasks done per sprint.' }])
})
