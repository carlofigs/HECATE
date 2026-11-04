/**
 * WeekCalendarView — renders the "Week at a Glance" section as a Mon–Fri grid.
 *
 * Two data paths, same output shape:
 *
 *   Structured path (preferred):
 *     Props include `calendarEvents: CalendarEvent[]` written by GitHub Actions.
 *     No parsing needed — events are typed, richer fields available.
 *
 *   Markdown fallback:
 *     `calendarEvents` is absent/empty → falls back to parsing the `content`
 *     markdown table (hand-typed weeks still work with zero regression).
 *
 * Layout:
 *         Mon   Tue   Wed   Thu   Fri   ← shared column header (once)
 *   W16   Apr 21 ...                   ← per-week: month + date
 *   W17   Apr 28  ...  Apr 30  May 1   ← handles month boundaries
 *
 * Structured mode enhancements over markdown:
 *   - Event type colour band (meeting / focus / deadline / ooo / other)
 *   - All-day events rendered as a header pill above timed events
 *   - Start–end duration ("10:00–11:30") instead of single time
 *   - Recurring indicator (↻)
 *   - Location micro-badge
 *   - Task ID chips from taskIds[]
 *   - Click-to-open-in-GCal link
 */

import { useMemo, type ReactNode } from 'react'
import { MapPin, RefreshCw, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'
import { TASK_ID_PATTERN } from '@/lib/taskConstants'
import type { CalendarEvent } from '@/lib/schemas'

// ─── Constants ───────────────────────────────────────────────────────────────

const DOW_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DOW_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function midnightMs(d: Date): number {
  return new Date(d).setHours(0, 0, 0, 0)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ─── Event type styling ───────────────────────────────────────────────────────

const EVENT_TYPE_STYLES: Record<string, { band: string; bg: string; border: string; text: string }> = {
  meeting:  { band: 'bg-blue-500',   bg: 'bg-blue-500/5',   border: 'border-blue-500/25',   text: 'text-blue-600 dark:text-blue-400'   },
  focus:    { band: 'bg-green-500',  bg: 'bg-green-500/5',  border: 'border-green-500/25',  text: 'text-green-600 dark:text-green-400' },
  deadline: { band: 'bg-red-500',    bg: 'bg-red-500/5',    border: 'border-red-500/25',    text: 'text-red-600 dark:text-red-400'     },
  ooo:      { band: 'bg-orange-500', bg: 'bg-orange-500/5', border: 'border-orange-500/25', text: 'text-orange-600 dark:text-orange-400' },
  other:    { band: 'bg-border',     bg: 'bg-background/50',border: 'border-border/50',     text: 'text-muted-foreground'              },
}

function eventStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? EVENT_TYPE_STYLES.other
}

// ─── Shared cell types ────────────────────────────────────────────────────────

interface DayCell {
  dayName:    string
  date:       Date
  dateN:      number
  monthShort: string
  isToday:    boolean
}

interface WeekRow {
  mondayKey: string
  weekNum:   number
  cells:     DayCell[]
}

function currentMondayMs(): number {
  const d = new Date()
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - dow)
  return midnightMs(d)
}

// ─── Structured path helpers ──────────────────────────────────────────────────

function buildWeeksFromEvents(events: CalendarEvent[]): WeekRow[] {
  const todayMs  = midnightMs(new Date())
  const curMonMs = currentMondayMs()

  const mondayKeys = new Set<string>()

  // Always include current week
  const todayDate = new Date()
  const todayDow  = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1
  const thisMonday = new Date(todayDate)
  thisMonday.setDate(todayDate.getDate() - todayDow)
  mondayKeys.add(isoDate(thisMonday))

  for (const ev of events) {
    const d   = new Date(`${ev.date}T00:00`)
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    const mon = new Date(d)
    mon.setDate(d.getDate() - dow)
    const monKey = isoDate(mon)
    if (new Date(`${monKey}T00:00`).getTime() >= curMonMs) {
      mondayKeys.add(monKey)
    }
  }

  return [...mondayKeys].sort().map(mondayKey => {
    const thisMonday = new Date(`${mondayKey}T00:00`)
    const weekNum    = isoWeekNumber(thisMonday)

    const cells: DayCell[] = DOW_NAMES.map((_dayName, i) => {
      const date = new Date(thisMonday)
      date.setDate(thisMonday.getDate() + i)
      return {
        dayName:    _dayName,
        date,
        dateN:      date.getDate(),
        monthShort: MONTH_NAMES[date.getMonth()],
        isToday:    midnightMs(date) === todayMs,
      }
    })

    return { mondayKey, weekNum, cells }
  })
}

// ─── Markdown fallback path ───────────────────────────────────────────────────

interface LegacyCalEvent {
  time:      string
  event:     string
  relevance: string
}

interface ParsedRow {
  dayName:   string
  dateN:     number
  time:      string
  event:     string
  relevance: string
}

function parseTable(markdown: string): ParsedRow[] {
  return markdown
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && !l.match(/^\|[-\s|]+\|$/))
    .slice(1)
    .flatMap(row => {
      const cells = row
        .split('|')
        .map(c => c.trim())
        .filter((_, i, a) => i > 0 && i < a.length - 1)
      if (cells.length < 4) return []
      const [label, time, event, relevance] = cells
      if (!label || label === '—') return []
      const parts   = label.split(' ')
      const dayName = parts[0] ?? ''
      const dateN   = parseInt(parts[1] ?? '', 10)
      if (!DOW_NAMES.includes(dayName) || isNaN(dateN)) return []
      return [{ dayName, dateN, time: time === '—' ? '' : (time ?? ''), event: event ?? '', relevance: relevance ?? '' }]
    })
}

function resolveDate(anchorMonday: Date, dayName: string, dateN: number): Date | null {
  const offset = DOW_INDEX[dayName] ?? 0
  for (let w = 0; w < 6; w++) {
    const candidate = new Date(anchorMonday)
    candidate.setDate(anchorMonday.getDate() + w * 7 + offset)
    if (candidate.getDate() === dateN) return candidate
  }
  for (let w = -2; w < 0; w++) {
    const candidate = new Date(anchorMonday)
    candidate.setDate(anchorMonday.getDate() + w * 7 + offset)
    if (candidate.getDate() === dateN) return candidate
  }
  return null
}

function buildWeeksFromMarkdown(content: string, weekOf: string): Array<WeekRow & { legacyDayMap: Map<string, LegacyCalEvent[]> }> {
  const anchor    = new Date(`${weekOf}T00:00`)
  const anchorDow = anchor.getDay() === 0 ? 6 : anchor.getDay() - 1
  const anchorMonday = new Date(anchor)
  anchorMonday.setDate(anchor.getDate() - anchorDow)

  const todayMs  = midnightMs(new Date())
  const curMonMs = currentMondayMs()
  const rows     = parseTable(content)

  const weekMap = new Map<string, Map<string, LegacyCalEvent[]>>()

  for (const row of rows) {
    if (!row.event || row.event === '—') continue
    const date = resolveDate(anchorMonday, row.dayName, row.dateN)
    if (!date) continue
    const dow    = date.getDay() === 0 ? 6 : date.getDay() - 1
    const monday = new Date(date)
    monday.setDate(date.getDate() - dow)
    const mondayKey = isoDate(monday)
    const dayKey    = isoDate(date)
    if (!weekMap.has(mondayKey)) weekMap.set(mondayKey, new Map())
    const dayMap = weekMap.get(mondayKey)!
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push({ time: row.time, event: row.event, relevance: row.relevance })
  }

  if (weekMap.size === 0) {
    const currentMonday = new Date()
    currentMonday.setHours(0, 0, 0, 0)
    const dow = currentMonday.getDay() === 0 ? 6 : currentMonday.getDay() - 1
    currentMonday.setDate(currentMonday.getDate() - dow)
    weekMap.set(isoDate(currentMonday), new Map())
  }

  return [...weekMap.keys()].sort().filter(key =>
    new Date(`${key}T00:00`).getTime() >= curMonMs,
  ).map(mondayKey => {
    const thisMonday = new Date(`${mondayKey}T00:00`)
    const cells: DayCell[] = DOW_NAMES.map((_dayName, i) => {
      const date = new Date(thisMonday)
      date.setDate(thisMonday.getDate() + i)
      return {
        dayName:    _dayName,
        date,
        dateN:      date.getDate(),
        monthShort: MONTH_NAMES[date.getMonth()],
        isToday:    midnightMs(date) === todayMs,
      }
    })
    return {
      mondayKey,
      weekNum: isoWeekNumber(thisMonday),
      cells,
      legacyDayMap: weekMap.get(mondayKey) ?? new Map(),
    }
  })
}

// ─── Inline chip renderer (markdown fallback) ─────────────────────────────────

function InlineContent({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  const re = new RegExp(TASK_ID_PATTERN, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<TaskIdChip key={`${match[1]}-${match.index}`} taskid={match[1]} />)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ─── Structured event card ────────────────────────────────────────────────────

function StructuredEventCard({ ev, isToday }: { ev: CalendarEvent; isToday: boolean }) {
  const s = eventStyle(ev.type)

  const timeLabel = ev.isAllDay
    ? null
    : ev.endTime
      ? `${ev.startTime}–${ev.endTime}`
      : ev.startTime || null

  return (
    <div className={cn('rounded border overflow-hidden', s.border, s.bg, isToday && 'ring-1 ring-primary/20')}>
      <div className={cn('h-0.5 w-full', s.band)} />
      <div className="px-1.5 py-1 space-y-0.5">
        {timeLabel && (
          <p className={cn('text-[9px] font-mono tabular-nums flex items-center gap-1', s.text)}>
            {timeLabel}
            {ev.isRecurring && <RefreshCw className="w-2.5 h-2.5 opacity-60 shrink-0" />}
          </p>
        )}
        <div className="flex items-start gap-1">
          <p className="text-[11px] font-medium text-foreground leading-snug flex-1 min-w-0">
            {ev.title}
          </p>
          {ev.calLink && (
            <a
              href={ev.calLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-px shrink-0 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
              title="Open in Google Calendar"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        {ev.location && (
          <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1 truncate">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{ev.location}</span>
          </p>
        )}
        {ev.taskIds && ev.taskIds.length > 0 && (
          <div className="flex flex-wrap gap-0.5 pt-0.5">
            {ev.taskIds.map(id => <TaskIdChip key={id} taskid={id} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ColumnHeaders() {
  return (
    <div className="flex items-center gap-1.5 min-w-[520px]">
      <div className="w-5 shrink-0" />
      <div className="flex gap-1.5 flex-1">
        {DOW_NAMES.map(day => (
          <div key={day} className="flex-1 text-center pb-1 border-b border-border/40">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {day}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DayCellHeader({ cell }: { cell: DayCell }) {
  return (
    <div className={cn('px-2 py-1 text-center shrink-0', cell.isToday ? 'bg-primary/15' : 'bg-muted/40')}>
      <span className={cn('text-[10px]', cell.isToday ? 'text-primary/70' : 'text-muted-foreground/50')}>
        {cell.monthShort}
      </span>
      <span className={cn('ml-1 text-[10px] font-semibold tabular-nums', cell.isToday ? 'text-primary' : 'text-muted-foreground')}>
        {cell.dateN}
      </span>
      {cell.isToday && (
        <span className="ml-1 text-[8px] text-primary/60 font-medium uppercase tracking-wide">today</span>
      )}
    </div>
  )
}

function WeekLabel({ weekNum }: { weekNum: number }) {
  return (
    <div className="flex items-center justify-center shrink-0 w-5">
      <span
        className="text-[9px] font-semibold text-muted-foreground/40 tracking-widest uppercase select-none"
        style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
      >
        W{weekNum}
      </span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  content:         string
  weekOf:          string
  calendarEvents?: CalendarEvent[]
  onEdit:          () => void
}

export function WeekCalendarView({ content, weekOf, calendarEvents, onEdit }: Props) {
  const useStructured = (calendarEvents?.length ?? 0) > 0

  const structuredWeeks = useMemo(
    () => useStructured ? buildWeeksFromEvents(calendarEvents!) : [],
    [useStructured, calendarEvents],
  )

  const markdownWeeks = useMemo(
    () => useStructured ? [] : buildWeeksFromMarkdown(content, weekOf),
    [useStructured, content, weekOf],
  )

  return (
    <div className="space-y-2 overflow-x-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        {useStructured && (
          <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">
            synced from calendar
          </span>
        )}
        <div className={useStructured ? '' : 'ml-auto'}>
          <button
            onClick={onEdit}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            Edit table →
          </button>
        </div>
      </div>

      <ColumnHeaders />

      {/* ── Structured rendering ── */}
      {useStructured && structuredWeeks.map(week => {
        const eventsByDay = new Map<string, CalendarEvent[]>()
        for (const ev of calendarEvents!) {
          const d   = new Date(`${ev.date}T00:00`)
          const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
          const mon = new Date(d); mon.setDate(d.getDate() - dow)
          if (isoDate(mon) !== week.mondayKey) continue
          if (!eventsByDay.has(ev.date)) eventsByDay.set(ev.date, [])
          eventsByDay.get(ev.date)!.push(ev)
        }

        return (
          <div key={week.mondayKey} className="flex items-stretch gap-1.5 min-w-[520px] pb-0.5">
            <WeekLabel weekNum={week.weekNum} />
            <div className="flex gap-1.5 flex-1">
              {week.cells.map(cell => {
                const dayKey = isoDate(cell.date)
                const allEvs = eventsByDay.get(dayKey) ?? []
                const allDay = allEvs.filter(e => e.isAllDay)
                const timed  = allEvs.filter(e => !e.isAllDay).sort((a, b) => a.startTime.localeCompare(b.startTime))

                return (
                  <div
                    key={cell.dayName}
                    className={cn(
                      'flex flex-col flex-1 min-w-0 rounded-lg border overflow-hidden',
                      cell.isToday ? 'border-primary/50' : 'border-border',
                    )}
                  >
                    <DayCellHeader cell={cell} />
                    <div className="flex flex-col gap-1 p-1 bg-card/50 flex-1 min-h-[3rem]">
                      {allDay.map(ev => (
                        <div
                          key={ev.id}
                          className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium truncate text-white', eventStyle(ev.type).band)}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {timed.length === 0 && allDay.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-[10px] text-muted-foreground/20">—</span>
                        </div>
                      ) : (
                        timed.map(ev => <StructuredEventCard key={ev.id} ev={ev} isToday={cell.isToday} />)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* ── Markdown fallback rendering ── */}
      {!useStructured && markdownWeeks.map(week => (
        <div key={week.mondayKey} className="flex items-stretch gap-1.5 min-w-[520px] pb-0.5">
          <WeekLabel weekNum={week.weekNum} />
          <div className="flex gap-1.5 flex-1">
            {week.cells.map(cell => {
              const dayKey = isoDate(cell.date)
              const events = week.legacyDayMap.get(dayKey) ?? []

              return (
                <div
                  key={cell.dayName}
                  className={cn(
                    'flex flex-col flex-1 min-w-0 rounded-lg border overflow-hidden',
                    cell.isToday ? 'border-primary/50' : 'border-border',
                  )}
                >
                  <DayCellHeader cell={cell} />
                  <div className="flex flex-col gap-1 p-1 bg-card/50 flex-1 min-h-[3rem]">
                    {events.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-[10px] text-muted-foreground/20">—</span>
                      </div>
                    ) : (
                      events.map((ev, i) => (
                        <div
                          key={`${ev.time}-${i}`}
                          className={cn(
                            'rounded border px-1.5 py-1 space-y-0.5',
                            cell.isToday ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-background/50',
                          )}
                        >
                          {ev.time && (
                            <p className="text-[9px] font-mono text-muted-foreground/50 tabular-nums">{ev.time}</p>
                          )}
                          <p className="text-[11px] font-medium text-foreground leading-snug">{ev.event}</p>
                          {ev.relevance && (
                            <p className="text-[10px] text-muted-foreground flex flex-wrap gap-1 items-center leading-relaxed">
                              <InlineContent text={ev.relevance} />
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
