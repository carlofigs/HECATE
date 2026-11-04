/**
 * dates.ts — date-only arithmetic that never depends on the machine's time zone.
 *
 * v1 computed weeks with local-time Date methods and then formatted in UTC, so
 * in Australian time zones a Monday often came out as the Sunday before. Here:
 *
 * - A calendar date is a `YYYY-MM-DD` string (IsoDate), never a Date.
 * - Arithmetic converts it to a UTC day number (`Date.UTC(y, m - 1, d) / 1 day`)
 *   and back through getUTC* only. No local-time method appears in this package
 *   (the lint config bans them).
 * - "Today" is the one question that needs a zone, and it is always asked of the
 *   workspace's zone explicitly: `todayIn('Australia/Sydney')`.
 * - Day and month names come from fixed English arrays, not ICU, so output is
 *   identical in browsers, Node and the Workers runtime.
 */

import { IsoDate } from './primitives.ts'

const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** An ISO week: `2026-W42`. */
export type IsoWeekKey = `${number}-W${string}`

/** What sprintOf needs from a workspace's sprint settings. */
export interface SprintCadence {
  /** First day of sprint `anchorNumber`. Its weekday is every sprint's start day. */
  anchor: IsoDate
  anchorNumber: number
  lengthWeeks: number
}

export interface SprintPosition {
  n: number
  start: IsoDate
  end: IsoDate
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** Validate and brand a `YYYY-MM-DD` string. Throws RangeError on anything else. */
export function isoDate(value: string): IsoDate {
  const parsed = IsoDate.safeParse(value)
  if (!parsed.success) throw new RangeError(`Not a valid date (YYYY-MM-DD): ${JSON.stringify(value)}`)
  return parsed.data
}

function parts(d: IsoDate): [number, number, number] {
  const m = DATE_RE.exec(d)
  if (!m) throw new RangeError(`Not a valid date (YYYY-MM-DD): ${JSON.stringify(d)}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function toDayNumber(d: IsoDate): number {
  const [y, m, day] = parts(d)
  return Date.UTC(y, m - 1, day) / DAY_MS
}

function fromDayNumber(n: number): IsoDate {
  const dt = new Date(n * DAY_MS)
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}` as IsoDate
}

/** True for any zone name the runtime's Intl data recognises, e.g. `Australia/Sydney`. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const todayFormatters = new Map<string, Intl.DateTimeFormat>()

/** The calendar date it is right now (or at `now`) in the given zone. */
export function todayIn(tz: string, now: Date = new Date()): IsoDate {
  let fmt = todayFormatters.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'iso8601',
      numberingSystem: 'latn',
    })
    todayFormatters.set(tz, fmt)
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    fmt.formatToParts(now).find(p => p.type === type)?.value ?? ''
  return isoDate(`${get('year')}-${get('month')}-${get('day')}`)
}

export function addDays(d: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`addDays needs a whole number of days, got ${n}`)
  return fromDayNumber(toDayNumber(d) + n)
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a)
}

export function weekdayOf(d: IsoDate): IsoWeekday {
  // Day 0 (1970-01-01) was a Thursday: ISO weekday 4.
  return ((((toDayNumber(d) + 3) % 7) + 7) % 7 + 1) as IsoWeekday
}

export function mondayOf(d: IsoDate): IsoDate {
  return addDays(d, 1 - weekdayOf(d))
}

/** ISO 8601 week, e.g. `2027-01-03` → `2026-W53`. The week belongs to the year of its Thursday. */
export function isoWeekKey(d: IsoDate): IsoWeekKey {
  const thursday = addDays(d, 4 - weekdayOf(d))
  const year = parts(thursday)[0]
  const dayOfYear = diffDays(`${pad(year, 4)}-01-01` as IsoDate, thursday) + 1
  return `${pad(year, 4)}-W${pad(Math.floor((dayOfYear - 1) / 7) + 1)}` as IsoWeekKey
}

/** Monday and Sunday of an ISO week. Throws on a week that does not exist (e.g. W53 of a 52-week year). */
export function weekRange(key: string): { start: IsoDate; end: IsoDate } {
  const m = WEEK_KEY_RE.exec(key)
  if (!m) throw new RangeError(`Not an ISO week key (YYYY-Www): ${JSON.stringify(key)}`)
  const year = Number(m[1])
  const week = Number(m[2])
  const weekOneMonday = mondayOf(`${pad(year, 4)}-01-04` as IsoDate)
  const start = addDays(weekOneMonday, (week - 1) * 7)
  if (week < 1 || isoWeekKey(start) !== key) throw new RangeError(`ISO week ${key} does not exist`)
  return { start, end: addDays(start, 6) }
}

/**
 * Which sprint a date falls in. Sprints are `lengthWeeks` long and numbered
 * consecutively from the anchor, in both directions (dates before the anchor
 * get lower numbers).
 */
export function sprintOf(d: IsoDate, cadence: SprintCadence): SprintPosition {
  const length = 7 * cadence.lengthWeeks
  const k = Math.floor(diffDays(cadence.anchor, d) / length)
  const start = addDays(cadence.anchor, k * length)
  return { n: cadence.anchorNumber + k, start, end: addDays(start, length - 1) }
}

/** `Mon 12 Oct` — the day label the focus page and skills use. */
export function formatDay(d: IsoDate): string {
  const [, m, day] = parts(d)
  return `${DAY_NAMES[weekdayOf(d) - 1]} ${day} ${MONTH_NAMES[m - 1]}`
}

/** `12 Oct 2026` — used in "Week of …" headings. */
export function formatWeekOf(d: IsoDate): string {
  const [y, m, day] = parts(d)
  return `${day} ${MONTH_NAMES[m - 1]} ${y}`
}
