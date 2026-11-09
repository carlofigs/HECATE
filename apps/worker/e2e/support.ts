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
 * task key falls there). A node it could not measure is attached, not failed:
 * axe reports a ratio of 0 for text it cannot see, such as a tab scrolled out
 * of its list or a dialog behind another; a real shortfall has a positive ratio.
 */
function shortfalls(results: AxeResults): { failures: string[]; unmeasured: string[] } {
  const failures = results.violations.map(v => `${v.id} (${v.impact ?? '?'}): ${v.help}\n${v.nodes.map(n => `    ${n.target.join(' ')}`).join('\n')}`)
  const unmeasured: string[] = []
  for (const rule of results.incomplete) {
    if (rule.id !== 'color-contrast') continue
    for (const node of rule.nodes) {
      const data = node.any[0]?.data as { contrastRatio?: number; expectedContrastRatio?: string } | undefined
      const expected = Number.parseFloat(data?.expectedContrastRatio ?? '')
      if (!data?.contrastRatio || Number.isNaN(expected)) unmeasured.push(node.target.join(' '))
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

/** A private copy of the Planning workspace for a test that writes (harness.ts). */
export async function claimWorkspace(page: Page): Promise<string> {
  const response = await page.request.get('/__harness/claim')
  expect(response.ok(), 'the harness has scratch workspaces left').toBe(true)
  return ((await response.json()) as { dir: string }).dir
}

interface StoredTask {
  key: string
  title: string
  status: string
  order: string
  completedAt: string | null
}

/**
 * Waits for the app to finish sending (a change shows before the Worker has
 * it), commits the workspace's pending changes now, and reads what reached
 * git: its tasks, the commit messages and every file.
 */
export async function committed(page: Page, dir: string): Promise<{ tasks: StoredTask[]; log: string[]; files: Record<string, string> }> {
  await expect(page.getByRole('status').filter({ hasText: /^Saving…$|changes? waiting|Couldn't save/ })).toHaveCount(0)
  const origin = new URL(page.url()).origin
  const path = `/api/workspaces/${encodeURIComponent(dir)}`
  // Flush until nothing is left to commit. Every test writes to the same fake branch at once, so a commit can lose
  // the race and be deferred (ADR 0002); a flush commits now regardless.
  await expect
    .poll(
      async () => {
        expect((await page.request.post(`${path}/flush`, { headers: { origin } })).ok(), 'flush').toBe(true)
        return ((await (await page.request.get(path)).json()) as { pending: number }).pending
      },
      { timeout: 30_000 },
    )
    .toBe(0)
  const git = (await (await page.request.get(`/__harness/git?dir=${encodeURIComponent(dir)}`)).json()) as { files: Record<string, string>; log: string[] }
  const tasks = JSON.parse(git.files['tasks.json'] ?? '{"tasks":[]}') as { tasks: StoredTask[] }
  return { tasks: tasks.tasks, log: git.log, files: git.files }
}

/** A committed JSON file, parsed: `focus/2026-11-09.json`, `focus/keep-in-mind.json`. */
export function stored<T>(files: Record<string, string>, path: string): T {
  const text = files[path]
  expect(text, `${path} was committed`).toBeDefined()
  return JSON.parse(text ?? 'null') as T
}

/** The keys a Board column shows, in order (wide layout: the column's region; narrow: the open tab). */
export async function columnKeys(page: Page, status: string): Promise<string[]> {
  const column = page.locator('section', { has: page.getByRole('heading', { level: 2, name: new RegExp(`^${status}`) }) })
  return column.locator('article').evaluateAll(cards => cards.map(c => (c.getAttribute('aria-label') ?? '').split(' ')[0] ?? ''))
}
