/**
 * The Board on ops (P4 acceptance: drag, add, edit and complete work), each
 * test on its own copy of Planning so tests never share state, and each
 * change followed into git.
 *
 * Planning: To Do A2, B1 · In Progress A1, A5 · Backlog A3 · Done A4.
 */
import { expect, test, type Page } from '@playwright/test'
import { claimWorkspace, columnKeys, committed, isTouch, signIn } from './support.ts'

async function openBoard(page: Page): Promise<string> {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board`)
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await expect(page.getByRole('article').first()).toBeVisible()
  return dir
}

/** Shows a status: its tab on a narrow screen; every column is already visible on a wide one. */
async function show(page: Page, status: string): Promise<void> {
  if (isTouch()) await page.getByRole('tab', { name: new RegExp(`^${status}`) }).click()
}

const task = (tasks: { key: string }[], key: string) => tasks.find(t => t.key === key)

test('completing a task moves it to Done, says so, and Undo puts it back exactly', async ({ page }) => {
  const dir = await openBoard(page)
  await show(page, 'In Progress')
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Completed A1' })).toBeVisible()
  await show(page, 'Done')
  expect(await columnKeys(page, 'Done')).toEqual(['A4', 'A1'])
  expect(task((await committed(page, dir)).tasks, 'A1')).toMatchObject({ status: 'done', completedAt: expect.any(String) })

  await page.getByRole('button', { name: 'Undo' }).click()
  await show(page, 'In Progress')
  await expect.poll(() => columnKeys(page, 'In Progress')).toEqual(['A1', 'A5'])
  expect(task((await committed(page, dir)).tasks, 'A1')).toMatchObject({ status: 'in-progress', completedAt: null })
})

test('the Move menu moves a task to another status and within its column, without dragging', async ({ page }) => {
  const dir = await openBoard(page)
  await page.getByRole('button', { name: 'Move A2' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'In Progress' }).click()
  await show(page, 'In Progress')
  await expect.poll(() => columnKeys(page, 'In Progress')).toEqual(['A1', 'A5', 'A2'])

  await page.getByRole('button', { name: 'Move A2' }).click()
  await page.getByRole('menuitem', { name: 'Move to top' }).click()
  await expect.poll(() => columnKeys(page, 'In Progress')).toEqual(['A2', 'A1', 'A5'])

  const { tasks, log } = await committed(page, dir)
  const order = (k: string) => task(tasks, k) as unknown as { order: string; status: string }
  expect(order('A2').status).toBe('in-progress')
  expect(order('A2').order < order('A1').order).toBe(true)
  expect(log.some(m => m.includes('A2'))).toBe(true)
})

test('a task dragged by its handle lands where it is dropped', async ({ page }) => {
  test.skip(isTouch(), 'Columns side by side: a wide screen with a pointer')
  const dir = await openBoard(page)
  const handle = page.getByRole('button', { name: 'Drag A2' })
  const target = page.getByRole('article', { name: /^A5 / })
  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('not laid out')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  // Where among A1 and A5 it lands depends on the path the pointer took (moves.test.ts pins the rule itself);
  // what matters here is that it lands in the column it was dropped on, and that git agrees with the screen.
  await expect.poll(async () => (await columnKeys(page, 'In Progress')).sort()).toEqual(['A1', 'A2', 'A5'])
  expect(await columnKeys(page, 'To Do')).toEqual(['B1'])
  const shown = await columnKeys(page, 'In Progress')
  const { tasks } = await committed(page, dir)
  const inGit = tasks.filter(t => t.status === 'in-progress').sort((a, b) => (a.order < b.order ? -1 : 1)).map(t => t.key)
  expect(inGit).toEqual(shown)
})

test('a task moves by keyboard: Space on the handle, arrows, Space', async ({ page }) => {
  test.skip(isTouch(), 'Columns side by side: a wide screen with a keyboard')
  await openBoard(page)
  // Each step waits for what a screen reader would hear, as a person waits to see the card move.
  const heard = (text: string | RegExp) => expect(page.getByRole('status').filter({ hasText: text })).toBeAttached()
  await page.getByRole('button', { name: 'Drag A1' }).focus()
  await page.keyboard.press('Space')
  // The live region says it was picked up, then at once where it is: either means the drag has started.
  await heard(/^(Picked up A1, in In Progress, position 1 of 2\.|A1 is now in In Progress, position 1 of 2\.)$/)
  await page.keyboard.press('ArrowDown')
  await heard('A1 is now in In Progress, position 2 of 2.')
  await page.keyboard.press('Space')
  await heard(/^Dropped A1 in In Progress/)
  await expect.poll(() => columnKeys(page, 'In Progress')).toEqual(['A5', 'A1'])
  await expect(page.getByRole('button', { name: 'Drag A1' })).toBeFocused()
})

test('a task added in a column lands at its end', async ({ page }) => {
  const dir = await openBoard(page)
  await show(page, 'Backlog')
  const backlog = page.locator('section', { has: page.getByRole('heading', { level: 2, name: /^Backlog/ }) })
  await backlog.getByRole('button', { name: 'Add task' }).click()
  await backlog.getByLabel('New task in Backlog').fill('Write the release notes')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Added A6' })).toBeVisible()
  await expect.poll(() => columnKeys(page, 'Backlog')).toEqual(['A3', 'A6'])
  await expect(backlog.getByLabel('New task in Backlog')).toHaveValue('')
  expect(task((await committed(page, dir)).tasks, 'A6')).toMatchObject({ title: 'Write the release notes', status: 'backlog' })
})

test('New task checks the form, then adds a B task with who it waits on', async ({ page }) => {
  const dir = await openBoard(page)
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Give the task a title.')
  await expect(dialog.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true')

  await dialog.getByLabel(/^Title/).fill('Sign-off on the layout')
  await dialog.getByRole('radio', { name: 'Waiting on someone (B)' }).check()
  await dialog.getByLabel('Waiting on', { exact: true }).fill('Design lead')
  await dialog.getByLabel('Depends on').fill('A9')
  await dialog.getByLabel('Depends on').blur()
  await expect(dialog.getByLabel('Depends on')).toHaveAccessibleDescription(/There is no A9 in this workspace\./)
  await dialog.getByLabel('Depends on').fill('a1')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Added B2' })).toBeVisible()
  expect(task((await committed(page, dir)).tasks, 'B2')).toMatchObject({ title: 'Sign-off on the layout', status: 'to-do' })
})

test('editing a task saves what changed, including its status', async ({ page }) => {
  const dir = await openBoard(page)
  await show(page, 'In Progress')
  await page.getByRole('button', { name: 'Plan the team offsite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit A5' })
  await expect(page).toHaveURL(/[?&]task=A5(&|$)/)
  await dialog.getByLabel(/^Title/).fill('Plan the team offsite in March')
  await dialog.getByLabel('Status').selectOption('to-do')
  await dialog.getByRole('radio', { name: 'High' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Saved A5' })).toBeVisible()
  await show(page, 'To Do')
  await expect(page.getByRole('article', { name: 'A5 Plan the team offsite in March' })).toBeVisible()
  expect(task((await committed(page, dir)).tasks, 'A5')).toMatchObject({ title: 'Plan the team offsite in March', status: 'to-do' })
})

test('deleting asks first, with Cancel as the default, then removes the task for good', async ({ page }) => {
  const dir = await openBoard(page)
  await show(page, 'Backlog')
  await page.getByRole('button', { name: 'Tidy the backlog' }).click()
  await page.getByRole('dialog', { name: 'Edit A3' }).getByRole('button', { name: 'Delete task' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete A3?' })
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Delete A3' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Deleted A3' })).toBeVisible()
  await expect(page.getByRole('article', { name: /^A3 / })).toHaveCount(0)
  expect(task((await committed(page, dir)).tasks, 'A3')).toBeUndefined()
})

test('a task on Today opens on the Board', async ({ page }) => {
  await signIn(page)
  await page.getByRole('region', { name: 'In progress' }).getByRole('link', { name: 'Draft the scorecard' }).click()
  await expect(page).toHaveURL(/\/w\/planning\/board\?task=A1$/)
  await expect(page.getByRole('dialog', { name: 'Edit A1' })).toBeVisible()
})

test('a refused change says why and leaves the board as it was', async ({ page }) => {
  await openBoard(page)
  await page.route('**/ops', route => route.fulfill({ status: 422, json: { status: 'rejected', message: 'Refused', errors: [{ message: 'A1 is archived' }] } }))
  await show(page, 'In Progress')
  await page.getByRole('button', { name: 'Complete A1' }).click()
  await expect(page.getByRole('status').filter({ hasText: "Couldn't complete A1" })).toContainText('A1 is archived')
  await expect.poll(() => columnKeys(page, 'In Progress')).toEqual(['A1', 'A5'])
})
