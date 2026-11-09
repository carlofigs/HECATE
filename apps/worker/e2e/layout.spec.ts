/**
 * What axe does not check: target size against HECATE's adaptive touch-first
 * floor (R-07), reflow (R-10), text spacing (R-11), the page outline (R-13)
 * and a keyboard pass through the shell (R-05, R-06).
 */
import { expect, test } from '@playwright/test'
import { isTouch, signIn, todayLoaded } from './support.ts'

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
})

test('every pointer target meets the floor for this device (R-07)', async ({ page }) => {
  const floor = isTouch() ? 44 : 24
  const undersized = await page.evaluate(min => {
    const selector = 'button, a[href], select, input, [role="tab"], [role="button"]'
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter(el => !el.classList.contains('sr-only'))
      .map(el => {
        const r = el.getBoundingClientRect()
        return { label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter(t => t.w > 0 && (t.w < min || t.h < min))
  }, floor)
  expect(undersized, `controls under ${floor} px`).toEqual([])
})

test('the page never scrolls sideways (R-10)', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('text spacing overrides clip nothing (R-11)', async ({ page }) => {
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
    [...document.querySelectorAll<HTMLElement>('main *')]
      .filter(el => el.children.length === 0 && (el.textContent ?? '').trim() !== '')
      .filter(el => {
        const style = getComputedStyle(el)
        return (style.overflow === 'hidden' || style.overflowY === 'hidden') && el.scrollHeight > el.clientHeight + 1
      })
      .map(el => el.textContent?.trim().slice(0, 40)),
  )
  expect(clipped).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('one h1, no skipped levels, and the landmarks (R-13)', async ({ page }) => {
  const outline = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => Number(h.tagName[1])))
  expect(outline.filter(level => level === 1)).toHaveLength(1)
  outline.forEach((level, i) => {
    if (i > 0) expect(level - (outline[i - 1] ?? 1), `heading ${i}`).toBeLessThanOrEqual(1)
  })
  await expect(page.getByRole('banner')).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
})

test('the keyboard reaches the skip link first, then every control, each with a visible ring (R-05, R-06)', async ({ page }) => {
  test.skip(isTouch(), 'A keyboard pass on a desktop layout')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  const order: string[] = []
  for (let i = 0; i < 4; i++) {
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
  expect(order).toEqual(['HECATE', 'Today', 'Workspace', 'Sign out'])
})

test('the skip link moves focus to the page', async ({ page }) => {
  test.skip(isTouch(), 'A keyboard pass on a desktop layout')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
