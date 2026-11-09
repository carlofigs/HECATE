import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { NOW } from './fixture.ts'

export { NOW }

/** Opens `path` signed out, signs in through the Worker's real flow, and waits for the page it lands on. */
export async function signIn(page: Page, path = '/'): Promise<void> {
  await page.clock.setFixedTime(NOW)
  await page.goto(path)
  await page.getByRole('link', { name: 'Sign in with GitHub' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** Today has loaded its data. */
export async function todayLoaded(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'In progress' })).toBeVisible()
}

/** Moves the page's clock on and tells it the window regained focus, so it refreshes as it would after a while away. */
export async function comeBackLater(page: Page, minutes = 5): Promise<void> {
  await page.clock.setFixedTime(new Date(NOW.getTime() + minutes * 60_000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

/**
 * Every violation, plus every contrast check axe measured but filed as "needs
 * review" while short of the ratio it expected (one-character text such as a
 * task key falls there). A node it could not measure is attached, not failed.
 */
function shortfalls(results: AxeResults): { failures: string[]; unmeasured: string[] } {
  const failures = results.violations.map(v => `${v.id} (${v.impact ?? '?'}): ${v.help}\n${v.nodes.map(n => `    ${n.target.join(' ')}`).join('\n')}`)
  const unmeasured: string[] = []
  for (const rule of results.incomplete) {
    if (rule.id !== 'color-contrast') continue
    for (const node of rule.nodes) {
      const data = node.any[0]?.data as { contrastRatio?: number; expectedContrastRatio?: string } | undefined
      const expected = Number.parseFloat(data?.expectedContrastRatio ?? '')
      if (data?.contrastRatio == null || Number.isNaN(expected)) unmeasured.push(node.target.join(' '))
      else if (data.contrastRatio < expected) failures.push(`color-contrast (needs review): ${data.contrastRatio}:1 is under ${expected}:1\n    ${node.target.join(' ')}`)
    }
  }
  return { failures, unmeasured }
}

/** axe over the whole page, zero tolerance (R-29 layer 1). */
export async function scan(page: Page, where: string): Promise<void> {
  const { failures, unmeasured } = shortfalls(await new AxeBuilder({ page }).withTags(TAGS).analyze())
  if (unmeasured.length > 0) await test.info().attach(`axe could not measure contrast on ${where}`, { body: unmeasured.join('\n'), contentType: 'text/plain' })
  expect(failures, `axe on ${where}`).toEqual([])
}

/** Whether this project emulates a touch device (touch-first density applies). */
export const isTouch = (): boolean => test.info().project.name.startsWith('phone') || test.info().project.name.startsWith('narrow')
