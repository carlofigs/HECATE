import { expect, test, type Page } from '@playwright/test'
import { comeBackLater, signIn, todayLoaded } from './support.ts'

const section = (page: Page, name: string) => page.getByRole('region', { name })

test('Today shows the briefing: schedule, plan, the week and every task list', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await expect(page.getByText('Wed 11 Nov · Sprint 7 · day 8 of 14 · closes Tue 17 Nov')).toBeVisible()

  const schedule = section(page, 'Schedule')
  await expect(schedule.getByText('All day')).toBeVisible()
  await expect(schedule.getByText('Office closes early')).toBeVisible()
  await expect(schedule.getByText('13:30–14:30')).toBeVisible()
  await expect(schedule.getByText('Most important')).toBeVisible()
  await expect(schedule.getByText('Needs prep')).toBeVisible()
  await expect(schedule.getByText('[Personal — blocked]')).toBeVisible()

  const plan = section(page, 'Plan for today')
  await expect(plan.getByText('Finish the scorecard draft')).toBeVisible()
  await expect(plan.getByText('B1', { exact: true })).toBeVisible()

  const week = section(page, 'This week')
  await expect(week.getByRole('heading', { level: 3, name: 'Focus' })).toBeVisible()
  await expect(week.getByText('launch date')).toBeVisible()

  await expect(section(page, 'In progress').getByText('Draft the scorecard')).toBeVisible()
  await expect(section(page, 'Waiting on').getByText('From Finance team')).toBeVisible()
  await expect(section(page, 'Waiting on').getByText('Next: Thu 11:00')).toBeVisible()
  await expect(section(page, 'Blocked').getByText('Blocked by A1, B1')).toBeVisible()
  await expect(section(page, 'Due soon').getByText('Overdue')).toBeVisible()
  await expect(section(page, 'Due soon').getByText('Hard deadline')).toBeVisible()
  await expect(section(page, 'Cutoffs and leave').getByText('Month-end close')).toBeVisible()
  await expect(section(page, 'Keep in mind').getByText('hand over')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible()
})

test('a workspace with nothing planned says so in every section', async ({ page }) => {
  await signIn(page, '/w/club/today')
  await expect(page.getByText('Nothing on the calendar today.')).toBeVisible()
  await expect(page.getByText(/^No plan for today yet/)).toBeVisible()
  await expect(page.getByText('No priorities set for this week.')).toBeVisible()
  await expect(page.getByText('Nothing is in progress.')).toBeVisible()
  await expect(page.getByText("You aren't waiting on anyone.")).toBeVisible()
  await expect(page.getByText('Nothing to keep in mind.')).toBeVisible()
})

test('the workspace switcher opens another workspace', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.getByLabel('Workspace').selectOption('club')
  await expect(page).toHaveURL(/\/w\/club\/today$/)
  await expect(page.getByText('Nothing on the calendar today.')).toBeVisible()
})

test('a workspace that does not exist says so, without a retry that cannot help', async ({ page }) => {
  await signIn(page, '/w/nowhere/today')
  await expect(page.getByRole('alert')).toContainText('The workspace “nowhere” doesn\'t exist')
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('a workspace that cannot load offers a retry that works', async ({ page }) => {
  await page.route('**/api/workspaces/planning', route => route.fulfill({ status: 503, json: { status: 'unavailable', message: 'GitHub did not answer' } }))
  await signIn(page)
  await expect(page.getByRole('alert')).toContainText("HECATE can't load the workspace “planning” right now")
  await expect(page.getByRole('alert')).toContainText('GitHub did not answer')
  await page.unroute('**/api/workspaces/planning')
  await page.getByRole('button', { name: 'Try again' }).click()
  await todayLoaded(page)
})

test('when a refresh fails, the last good data stays, marked with its time', async ({ page }) => {
  await signIn(page)
  await todayLoaded(page)
  await page.route('**/api/workspaces/planning', route => route.fulfill({ status: 503, json: { status: 'unavailable', message: 'GitHub did not answer' } }))
  await comeBackLater(page)
  await expect(page.getByRole('status').filter({ hasText: /^Showing what HECATE had at / })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: "Couldn't load" })).toBeVisible()
  await expect(section(page, 'In progress').getByText('Draft the scorecard')).toBeVisible()
})

test('offline, the page keeps its data and says it is offline', async ({ page, context }) => {
  await signIn(page)
  await todayLoaded(page)
  await context.setOffline(true)
  await comeBackLater(page)
  await expect(page.getByRole('status').filter({ hasText: /^Offline · as of / })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible()
  await expect(section(page, 'In progress').getByText('Draft the scorecard')).toBeVisible()
  await context.setOffline(false)
  await comeBackLater(page, 10)
  await expect(page.getByRole('status').filter({ hasText: 'Up to date' })).toBeVisible()
})
