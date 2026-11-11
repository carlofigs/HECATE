/**
 * What axe does not check: target size against HECATE's adaptive touch-first
 * floor (R-07), reflow (R-10, and 640 px for 200% zoom), text spacing (R-11)
 * and the page outline (R-13) on every page, and a keyboard pass through the
 * shell (R-05, R-06). Dialogs and menus: keyboard.spec.ts.
 */
import { expect, test } from '@playwright/test'
import { isTouch, signIn, todayLoaded } from './support.ts'

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
})

/** Every visible control's size, smallest first. */
async function undersizedTargets(page: import('@playwright/test').Page, min: number) {
  return page.evaluate(floor => {
    const selector = 'button, a[href], select, input, [role="tab"], [role="button"]'
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter(el => !el.classList.contains('sr-only'))
      .map(el => {
        const r = el.getBoundingClientRect()
        return { label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter(t => t.w > 0 && (t.w < floor || t.h < floor))
  }, min)
}

test('every pointer target meets the floor for this device (R-07)', async ({ page }) => {
  const floor = isTouch() ? 44 : 24
  expect(await undersizedTargets(page, floor), `controls under ${floor} px on Today`).toEqual([])
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Board' }).click()
  await expect(page.getByRole('article').first()).toBeVisible()
  expect(await undersizedTargets(page, floor), `controls under ${floor} px on the Board`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), 'the Board scrolls sideways').toBe(false)
  for (const [path, heading] of [['/w/planning/projects', 'Projects'], ['/w/planning/sprint', 'Sprint 7'], ['/w/studio/people', 'People'], ['/w/planning/activity', 'Activity'], ['/w/planning/more', 'More']]) {
    await page.goto(path as string)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    expect(await undersizedTargets(page, floor), `controls under ${floor} px on ${heading}`).toEqual([])
  }
  await page.goto('/w/studio/projects/website')
  await expect(page.getByRole('heading', { level: 2, name: 'Tasks' })).toBeVisible()
  expect(await undersizedTargets(page, floor), `controls under ${floor} px on a project`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), 'a project scrolls sideways').toBe(false)
})

test('the bottom bar holds every page and the page’s action without scrolling sideways (M-app-07)', async ({ page }) => {
  test.skip(!isTouch(), 'The bottom bar is for narrow screens')
  for (const path of ['/w/planning/board', '/w/planning/projects', '/w/studio/projects/website', '/w/planning/sprint', '/w/studio/people', '/w/planning/activity', '/w/planning/more']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const bar = page.getByRole('navigation', { name: 'Main' })
    await expect(bar.getByRole('link')).toHaveText(['Today', 'Board', 'More'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${path} scrolls sideways`).toBe(false)
    const overflow = await bar.evaluate(nav => {
      const row = nav.parentElement as HTMLElement
      return row.scrollWidth > row.clientWidth
    })
    expect(overflow, `the bottom bar overflows on ${path}`).toBe(false)
  }
})

/** Every page and a detail page of each kind, from the fixture: Planning, Studio (Robin, a closed sprint), Club (empty). */
const PAGES: [string, string][] = [
  ['/w/planning/today', 'Today'], ['/w/club/today', 'Today'], ['/w/planning/board', 'Board'], ['/w/planning/projects', 'Projects'],
  ['/w/studio/projects/website', 'Website refresh'], ['/w/planning/sprint', 'Sprint 7'], ['/w/studio/sprint/6', 'Sprint 6'],
  ['/w/planning/more', 'More'], ['/w/studio/people', 'People'], ['/w/studio/people/01KQRBN0000000000000000000', 'Robin'],
  ['/w/planning/activity', 'Activity'],
]

const scrollsSideways = (page: import('@playwright/test').Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

async function eachPage(page: import('@playwright/test').Page, check: (path: string) => Promise<void>): Promise<void> {
  for (const [path, heading] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await check(path)
  }
}

test('no page scrolls sideways (R-10)', async ({ page }) => {
  await eachPage(page, async path => expect(await scrollsSideways(page), path).toBe(false))
})

test('at 200% zoom (640 px wide) no page scrolls sideways (R-10, R-11)', async ({ page }) => {
  test.skip(isTouch(), 'Zoom on a desktop layout')
  await page.setViewportSize({ width: 640, height: 800 })
  await eachPage(page, async path => expect(await scrollsSideways(page), path).toBe(false))
})

test('text spacing overrides clip nothing on any page (R-11)', async ({ page }) => {
  await eachPage(page, async path => {
    // Set through the CSSOM, as a user stylesheet or bookmarklet would: the CSP (rightly) refuses an injected <style>.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        el.style.setProperty('line-height', '1.5', 'important')
        el.style.setProperty('letter-spacing', '0.12em', 'important')
        el.style.setProperty('word-spacing', '0.16em', 'important')
        if (el.tagName === 'P') el.style.setProperty('margin-bottom', '2em', 'important')
      }
    })
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        // Visually hidden text (the skip link at rest, "new" after a count) is clipped on purpose.
        .filter(el => el.children.length === 0 && (el.textContent ?? '').trim() !== '' && el.offsetParent !== null && !el.closest('.sr-only'))
        .filter(el => el.getAttribute('href') !== '#main')
        .filter(el => {
          const style = getComputedStyle(el)
          const hides = [style.overflow, style.overflowX, style.overflowY].includes('hidden')
          return hides && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        })
        .map(el => el.textContent?.trim().slice(0, 40)),
    )
    expect(clipped, path).toEqual([])
    expect(await scrollsSideways(page), path).toBe(false)
  })
})

test('every page has one h1, no skipped levels, and the landmarks (R-13)', async ({ page }) => {
  await eachPage(page, async path => {
    const outline = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => Number(h.tagName[1])))
    expect(outline.filter(level => level === 1), path).toHaveLength(1)
    outline.forEach((level, i) => {
      if (i > 0) expect(level - (outline[i - 1] ?? 1), `${path}: heading ${i}`).toBeLessThanOrEqual(1)
    })
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
  })
})

test('the keyboard reaches the skip link first, then every control, each with a visible ring (R-05, R-06)', async ({ page }) => {
  test.skip(isTouch(), 'A keyboard pass on a desktop layout')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  const order: string[] = []
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const label = el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent : null
      const style = getComputedStyle(el)
      return { name: (label ?? el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim(), outline: style.outlineStyle, width: style.outlineWidth }
    })
    order.push(focused.name)
    expect(focused.outline, `focus ring on ${focused.name}`).toBe('solid')
    expect(focused.width, `focus ring on ${focused.name}`).toBe('2px')
  }
  // Activity's name carries its count of new entries ("Activity 7 new").
  expect(order).toEqual(['HECATE', 'Today', 'Board', 'Projects', 'Sprint', 'People', expect.stringMatching(/^Activity\s*7 new$/), 'Workspace', 'Sign out'])
})

test('the skip link moves focus to the page', async ({ page }) => {
  test.skip(isTouch(), 'A keyboard pass on a desktop layout')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
