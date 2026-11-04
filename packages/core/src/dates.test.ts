/**
 * Run under TZ=UTC and TZ=Australia/Sydney (see package.json). Every
 * expectation is identical in both: that is the point.
 */
import { describe, expect, it } from 'vitest'
import {
  addDays, diffDays, formatDay, formatWeekOf, isValidTimeZone, isoDate, isoWeekKey,
  mondayOf, sprintOf, todayIn, weekRange, weekdayOf, type SprintCadence,
} from './dates.ts'
import type { IsoDate } from './primitives.ts'

const d = (s: string): IsoDate => isoDate(s)
const at = (iso: string): Date => new Date(Date.parse(iso))
const SYD = 'Australia/Sydney'

it('runs under one of the zones the test script sets', () => {
  expect(['UTC', 'Etc/UTC', SYD]).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone)
})

describe('todayIn', () => {
  it('fixes the v1 bug: a Sydney Monday morning is Monday, not the UTC Sunday', () => {
    const today = todayIn(SYD, at('2026-10-11T22:30:00Z'))
    expect(today).toBe('2026-10-12')
    expect(mondayOf(today)).toBe('2026-10-12')
    expect(isoWeekKey(today)).toBe('2026-W42')
  })

  it('crosses midnight at the right instant when daylight saving starts (Sun 4 Oct 2026)', () => {
    expect(todayIn(SYD, at('2026-10-03T13:59:59Z'))).toBe('2026-10-03') // 23:59:59 AEST
    expect(todayIn(SYD, at('2026-10-03T14:00:00Z'))).toBe('2026-10-04') // 00:00 AEST
    expect(todayIn(SYD, at('2026-10-04T12:59:59Z'))).toBe('2026-10-04') // 23:59:59 AEDT
    expect(todayIn(SYD, at('2026-10-04T13:00:00Z'))).toBe('2026-10-05') // 00:00 AEDT
  })

  it('handles the repeated hour when daylight saving ends (Sun 5 Apr 2026)', () => {
    expect(todayIn(SYD, at('2026-04-04T15:30:00Z'))).toBe('2026-04-05') // 02:30 AEDT
    expect(todayIn(SYD, at('2026-04-04T16:30:00Z'))).toBe('2026-04-05') // 02:30 AEST, again
    expect(todayIn(SYD, at('2026-04-05T13:59:59Z'))).toBe('2026-04-05')
    expect(todayIn(SYD, at('2026-04-05T14:00:00Z'))).toBe('2026-04-06')
  })

  it('answers for UTC too', () => {
    expect(todayIn('UTC', at('2026-10-11T22:30:00Z'))).toBe('2026-10-11')
  })

  it('rejects an unknown zone', () => {
    expect(() => todayIn('Mars/Olympus', at('2026-01-01T00:00:00Z'))).toThrow(RangeError)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(SYD)).toBe(true)
  })
})

describe('date arithmetic', () => {
  it('validates dates, including leap days', () => {
    expect(isoDate('2028-02-29')).toBe('2028-02-29')
    expect(() => isoDate('2027-02-29')).toThrow(RangeError)
    expect(() => isoDate('2026-13-01')).toThrow(RangeError)
    expect(() => isoDate('2026-1-1')).toThrow(RangeError)
  })

  it('adds and diffs across month, year and leap boundaries', () => {
    expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29')
    expect(addDays(d('2027-02-28'), 1)).toBe('2027-03-01')
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(d('2026-01-01'), -1)).toBe('2025-12-31')
    expect(diffDays(d('2026-10-01'), d('2026-11-01'))).toBe(31)
    expect(diffDays(d('2026-11-01'), d('2026-10-01'))).toBe(-31)
    expect(() => addDays(d('2026-01-01'), 0.5)).toThrow(RangeError)
  })

  it('gives ISO weekdays and Mondays', () => {
    expect(weekdayOf(d('2026-10-12'))).toBe(1)
    expect(weekdayOf(d('2026-10-18'))).toBe(7)
    expect(weekdayOf(d('1970-01-01'))).toBe(4)
    expect(weekdayOf(d('1969-12-29'))).toBe(1)
    expect(mondayOf(d('2026-10-18'))).toBe('2026-10-12')
    expect(mondayOf(d('2026-10-12'))).toBe('2026-10-12')
    expect(mondayOf(d('2027-01-01'))).toBe('2026-12-28')
  })
})

describe('ISO weeks', () => {
  it.each([
    ['2026-12-31', '2026-W53'],
    ['2027-01-03', '2026-W53'],
    ['2027-01-04', '2027-W01'],
    ['2024-12-30', '2025-W01'],
    ['2021-01-03', '2020-W53'],
    ['2026-01-01', '2026-W01'],
  ])('%s is in %s', (date, week) => {
    expect(isoWeekKey(d(date))).toBe(week)
  })

  it('maps a week back to Monday–Sunday', () => {
    expect(weekRange('2026-W42')).toEqual({ start: '2026-10-12', end: '2026-10-18' })
    expect(weekRange('2026-W53')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
    expect(weekRange('2025-W01')).toEqual({ start: '2024-12-30', end: '2025-01-05' })
  })

  it('rejects weeks that do not exist', () => {
    expect(() => weekRange('2027-W53')).toThrow(RangeError)
    expect(() => weekRange('2026-W00')).toThrow(RangeError)
    expect(() => weekRange('2026-42')).toThrow(RangeError)
  })
})

describe('sprintOf (two-week sprints, Wednesday to Tuesday)', () => {
  const cadence: SprintCadence = { anchor: d('2026-09-30'), anchorNumber: 5, lengthWeeks: 2 }

  it('keeps the closing Tuesday in its sprint and opens the next on Wednesday', () => {
    expect(sprintOf(d('2026-10-13'), cadence)).toEqual({ n: 5, start: '2026-09-30', end: '2026-10-13' })
    expect(sprintOf(d('2026-10-14'), cadence)).toEqual({ n: 6, start: '2026-10-14', end: '2026-10-27' })
  })

  it('numbers sprints before the anchor too', () => {
    expect(sprintOf(d('2026-09-29'), cadence)).toEqual({ n: 4, start: '2026-09-16', end: '2026-09-29' })
  })

  it('stays 14 days long across a daylight-saving change', () => {
    const s = sprintOf(d('2026-10-04'), cadence)
    expect(s).toEqual({ n: 5, start: '2026-09-30', end: '2026-10-13' })
    expect(diffDays(s.start, s.end)).toBe(13)
  })
})

describe('labels', () => {
  it('formats days and weeks the way the focus page writes them', () => {
    expect(formatDay(d('2026-10-12'))).toBe('Mon 12 Oct')
    expect(formatDay(d('2026-11-01'))).toBe('Sun 1 Nov')
    expect(formatWeekOf(d('2026-10-12'))).toBe('12 Oct 2026')
  })
})
