/**
 * Reduced motion (R-12): with the operating system's setting on, nothing
 * moves. base.css makes every animation and transition instant; this checks
 * the surfaces that animate: a dialog, a menu and a toast.
 */
import { expect, test, type Page } from '@playwright/test'
import { claimWorkspace, isTouch, signIn } from './support.ts'

test.use({ reducedMotion: 'reduce' })

/** The longest animation or transition on what is open, in seconds. */
const longest = (page: Page, selector: string): Promise<number> =>
  page.evaluate(sel => {
    const seconds = (value: string): number => Math.max(...value.split(',').map(v => parseFloat(v) * (v.trim().endsWith('ms') ? 0.001 : 1)))
    return Math.max(0, ...[...document.querySelectorAll(sel)].flatMap(el => {
      const style = getComputedStyle(el)
      return [seconds(style.animationDuration), seconds(style.transitionDuration)]
    }))
  }, selector)

test('a dialog, a menu and a toast appear without movement', async ({ page }) => {
  await signIn(page, '/')
  const dir = await claimWorkspace(page)
  await page.goto(`/w/${dir}/board?task=A3`)
  await expect(page.getByRole('dialog', { name: 'Edit A3' })).toBeVisible()
  expect(await longest(page, '[role=dialog], [role=dialog] *, [data-state=open]')).toBeLessThanOrEqual(0.01)
  await page.keyboard.press('Escape')

  if (!isTouch()) {
    await page.getByRole('button', { name: 'Move A2' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(await longest(page, '[role=menu], [role=menu] *')).toBeLessThanOrEqual(0.01)
    await page.keyboard.press('Escape')
  }

  await page.goto(`/w/${dir}/board?status=in-progress`)
  await page.getByRole('button', { name: 'Complete A1' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Completed A1' })
  await expect(toast).toBeVisible()
  expect(await longest(page, 'li[data-state=open], li[data-state=open] *')).toBeLessThanOrEqual(0.01)
})
