/**
 * The keyboard pass for dialogs and menus (R-06, R-05; R-29 layer 2), on a
 * desktop layout: each opens from its trigger with Enter, holds focus inside,
 * closes with Escape, and gives focus back to its trigger. Also: the Board's
 * narrow tabs add no invisible stop, and a task moves with the keyboard alone.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { claimWorkspace, columnKeys, isTouch, signIn } from './support.ts'

const ROBIN = '/w/studio/people/01KQRBN0000000000000000000'

const DIALOGS: [string, string, (page: Page) => Locator][] = [
  ['New task', '/w/planning/board', p => p.getByRole('button', { name: 'New task' }).first()],
  ['the task editor', '/w/planning/board', p => p.getByRole('button', { name: /Publish the scorecard/ }).first()],
  ['Add to plan', '/w/planning/today', p => p.getByRole('region', { name: 'Plan for today' }).getByRole('button', { name: 'Add to plan' })],
  ['Close the day', '/w/planning/today', p => p.getByRole('region', { name: 'Plan for today' }).getByRole('button', { name: 'Close the day' })],
  ['New project', '/w/planning/projects', p => p.getByRole('button', { name: 'New project' }).first()],
  ['the project editor', '/w/studio/projects/website', p => p.getByRole('button', { name: 'Edit overview' })],
  ['a question', '/w/studio/projects/website', p => p.getByRole('button', { name: 'Edit “OQ-01”' })],
  ['the sprint goal', '/w/planning/sprint', p => p.getByRole('button', { name: 'Set the goal' })],
  ['Close sprint', '/w/planning/sprint', p => p.getByRole('button', { name: 'Review and close' }).first()],
  ['Add person', '/w/studio/people', p => p.getByRole('button', { name: 'Add person' }).first()],
  ['a term', '/w/studio/people', p => p.getByRole('button', { name: 'Edit “CMS”' })],
  ['the person editor', ROBIN, p => p.getByRole('button', { name: /^Edit/ }).first()],
  ['Add leave', ROBIN, p => p.getByRole('button', { name: 'Add leave' })],
  ['a person still linked', ROBIN, p => p.getByRole('button', { name: 'Remove Robin' })],
  ['Add to log', '/w/planning/activity', p => p.getByRole('main').getByRole('button', { name: 'Add to log' })],
]

const inside = (page: Page): Promise<boolean> =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog], [role=alertdialog], [role=menu]')))

test.describe('dialogs', () => {
  test.skip(() => isTouch(), 'A keyboard pass on a desktop layout')
  test.beforeEach(async ({ page }) => signIn(page))

  for (const [name, path, trigger] of DIALOGS) {
    test(`${name}: opens with Enter, keeps focus inside, closes with Escape, and returns focus`, async ({ page }) => {
      await page.goto(path)
      const opener = trigger(page)
      await opener.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
      await expect(dialog).toBeVisible()
      expect(await inside(page), 'focus moves inside').toBe(true)
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab')
        expect(await inside(page), `Tab ${i + 1} stays inside`).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(opener).toBeFocused()
    })
  }

  test('a confirmation starts on Cancel, and returns focus to what opened it', async ({ page }) => {
    await page.goto('/w/planning/board?task=A3')
    const editor = page.getByRole('dialog', { name: 'Edit A3' })
    const remove = editor.getByRole('button', { name: 'Delete task' })
    await remove.focus()
    await page.keyboard.press('Enter')
    const confirm = page.getByRole('alertdialog')
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
    // Radix registers the new top layer in an effect: an Escape within the same frame reaches the editor beneath
    // (recorded in design/audits/2026-11-pre-cutover.md). No person presses that fast; wait for the effects to run.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.keyboard.press('Escape')
    await expect(confirm).toHaveCount(0)
    await expect(remove).toBeFocused()
  })
})

test.describe('menus', () => {
  test.skip(() => isTouch(), 'A keyboard pass on a desktop layout')

  test('a menu moves with the arrow keys, shows a ring on the item, and returns focus on Escape', async ({ page }) => {
    await signIn(page)
    const opener = page.getByRole('button', { name: /^More for “/ }).first()
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    const item = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const style = getComputedStyle(el)
      return { role: el.getAttribute('role'), outline: style.outlineStyle, width: style.outlineWidth }
    })
    expect(item).toEqual({ role: 'menuitem', outline: 'solid', width: '2px' })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('a task moves to another column with the keyboard alone', async ({ page }) => {
    await signIn(page, '/')
    const dir = await claimWorkspace(page)
    await page.goto(`/w/${dir}/board`)
    const move = page.getByRole('button', { name: 'Move A3' })
    await move.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    // Down the list with the arrow keys to the To Do column, then Enter.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown')
      if ((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'To Do') break
    }
    await page.keyboard.press('Enter')
    await expect.poll(() => columnKeys(page, 'To Do')).toContain('A3')
    await expect(move).toBeFocused()
  })
})

test('the narrow Board’s tabs add no stop of their own: Tab goes from the tab into the column', async ({ page }) => {
  test.skip(!isTouch(), 'The tabs are the narrow layout')
  await signIn(page, '/w/planning/board')
  const tab = page.getByRole('tab', { selected: true })
  await tab.focus()
  await page.keyboard.press('Tab')
  const next = await page.evaluate(() => ({ role: document.activeElement?.getAttribute('role') ?? null, tag: document.activeElement?.tagName }))
  expect(next.role).not.toBe('tabpanel')
})
