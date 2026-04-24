/**
 * WeekCalendarView — renders the "Week at a Glance" markdown table as a
 * Mon–Fri calendar grid, one row per week.
 *
 * Layout:
 *         Mon   Tue   Wed   Thu   Fri   ← shared column header (once)
 *   W16   Apr 21 ...                   ← per-week: month + date
 *   W17   Apr 28  ...  Apr 30  May 1   ← month label per cell (handles boundaries)
 *
 * - Day names are column headers, shown once at the top
 * - Cell header shows short month + date number (e.g. "Apr 21", "May 2")
 * - Handles cross-month weeks correctly via real Date arithmetic
 * - Multiple weeks stack as separate rows
 * - Today's cell highlighted
 * - Task ID references in Relevance render as chips
 * - "Edit table →" drops back to raw textarea
 */

import { useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalEvent {
  time:      string
  event:     string
  relevance: string
}

interface DayCell {
  dayName:    string   // Mon | Tue | Wed | Thu | Fri
  date:       Date     // actual calendar date
  dateN:      number   // day-of-month for display
  monthShort: string   // Jan | Feb | ... | Dec
  events:     CalEvent[]
  isToday:    boolean
}

interface WeekRow {
  mondayKey: string    // ISO "YYYY-MM-DD" for stable React key
  weekNum:   number
  cells:     DayCell[] // always 5 items, Mon–Fri
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOW_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DOW_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Table parser ─────────────────────────────────────────────────────────────

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
    .slice(1) // skip header row
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

// ─── Date resolver ────────────────────────────────────────────────────────────
//
// Maps a (dayName, dateN) pair to an actual Date, anchored to weekOf.
// Searches forward up to 6 weeks and back 2 weeks from anchorMonday.
// This correctly handles cross-month weeks (e.g. Mon Apr 28, Fri May 2).

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

// ─── ISO week number ──────────────────────────────────────────────────────────

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ─── Week builder ─────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function buildWeeks(rows: ParsedRow[], weekOf: string): WeekRow[] {
  const anchor = new Date(`${weekOf}T00:00`)
  const anchorDow = anchor.getDay() === 0 ? 6 : anchor.getDay() - 1
  const anchorMonday = new Date(anchor)
  anchorMonday.setDate(anchor.getDate() - anchorDow)

  const todayMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() })()

  // Current Monday — used to filter out past weeks
  const currentMondayMs = (() => {
    const d = new Date(); d.setHours(0,0,0,0)
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    d.setDate(d.getDate() - dow)
    return d.getTime()
  })()

  // Group events by ISO monday date string → ISO day date string → events
  const weekMap = new Map<string, Map<string, CalEvent[]>>()

  for (const row of rows) {
    if (!row.event || row.event === '—') continue
    const date = resolveDate(anchorMonday, row.dayName, row.dateN)
    if (!date) continue

    // Find the Monday of this resolved date
    const dow = date.getDay() === 0 ? 6 : date.getDay() - 1
    const monday = new Date(date)
    monday.setDate(date.getDate() - dow)
    const mondayKey = isoDate(monday)
    const dayKey    = isoDate(date)

    if (!weekMap.has(mondayKey)) weekMap.set(mondayKey, new Map())
    const dayMap = weekMap.get(mondayKey)!
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push({ time: row.time, event: row.event, relevance: row.relevance })
  }

  // Fallback: no events parsed → synthesise one empty week from current Monday
  if (weekMap.size === 0) {
    const currentMonday = new Date(); currentMonday.setHours(0,0,0,0)
    const dow = currentMonday.getDay() === 0 ? 6 : currentMonday.getDay() - 1
    currentMonday.setDate(currentMonday.getDate() - dow)
    weekMap.set(isoDate(currentMonday), new Map())
  }

  // Build WeekRow for each Monday, sorted chronologically,
  // dropping any week that ended before the current Monday (i.e. past weeks)
  return [...weekMap.keys()].sort().filter(mondayKey => {
    const ms = new Date(`${mondayKey}T00:00`).getTime()
    return ms >= currentMondayMs
  }).map(mondayKey => {
    const thisMonday = new Date(`${mondayKey}T00:00`)
    const weekNum    = isoWeekNumber(thisMonday)

    const cells: DayCell[] = DOW_NAMES.map((_dayName, i) => {
      const date = new Date(thisMonday)
      date.setDate(thisMonday.getDate() + i)
      const dayKey = isoDate(date)
      return {
        dayName:    _dayName,
        date,
        dateN:      date.getDate(),
        monthShort: MONTH_NAMES[date.getMonth()],
        events:     weekMap.get(mondayKey)?.get(dayKey) ?? [],
        isToday:    date.setHours(0,0,0,0) === todayMs,
      }
    })

    return { mondayKey, weekNum, cells }
  })
}

// ─── Inline chip renderer ─────────────────────────────────────────────────────

const TASK_ID_RE = /\b(t-[a-z][a-z0-9]*(?:-[a-z0-9]+)?)\b/gi

function InlineContent({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  const re = new RegExp(TASK_ID_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<TaskIdChip key={match.index} taskid={match[1]} />)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  content: string
  weekOf:  string   // ISO date from FocusData e.g. "2026-04-14"
  onEdit:  () => void
}

export function WeekCalendarView({ content, weekOf, onEdit }: Props) {
  const weeks = useMemo(() => {
    const rows = parseTable(content)
    return buildWeeks(rows, weekOf)
  }, [content, weekOf])

  return (
    <div className="space-y-2 overflow-x-auto" onClick={e => e.stopPropagation()}>
      {/* Edit hint */}
      <div className="flex justify-end">
        <button
          onClick={onEdit}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          Edit table →
        </button>
      </div>

      {/* Column headers — Mon through Fri, shared across all weeks */}
      <div className="flex items-center gap-1.5 min-w-[520px]">
        {/* Spacer matching the week-number label width */}
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

      {/* Week rows */}
      {weeks.map(week => (
        <div key={week.mondayKey} className="flex items-stretch gap-1.5 min-w-[520px] pb-0.5">
          {/* Rotated week number */}
          <div className="flex items-center justify-center shrink-0 w-5">
            <span
              className="text-[9px] font-semibold text-muted-foreground/40 tracking-widest uppercase select-none"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              W{week.weekNum}
            </span>
          </div>

          <div className="flex gap-1.5 flex-1">
            {week.cells.map(cell => (
              <div
                key={cell.dayName}
                className={cn(
                  'flex flex-col flex-1 min-w-0 rounded-lg border overflow-hidden',
                  cell.isToday ? 'border-primary/50' : 'border-border',
                )}
              >
                {/* Date header — month + day number */}
                <div
                  className={cn(
                    'px-2 py-1 text-center shrink-0',
                    cell.isToday ? 'bg-primary/15' : 'bg-muted/40',
                  )}
                >
                  <span className={cn(
                    'text-[10px]',
                    cell.isToday ? 'text-primary/70' : 'text-muted-foreground/50',
                  )}>
                    {cell.monthShort}
                  </span>
                  <span className={cn(
                    'ml-1 text-[10px] font-semibold tabular-nums',
                    cell.isToday ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    {cell.dateN}
                  </span>
                  {cell.isToday && (
                    <span className="ml-1 text-[8px] text-primary/60 font-medium uppercase tracking-wide">
                      today
                    </span>
                  )}
                </div>

                {/* Events */}
                <div className="flex flex-col gap-1 p-1 bg-card/50 flex-1 min-h-[3rem]">
                  {cell.events.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-[10px] text-muted-foreground/20">—</span>
                    </div>
                  ) : (
                    cell.events.map((ev, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded border px-1.5 py-1 space-y-0.5',
                          cell.isToday
                            ? 'border-primary/20 bg-primary/5'
                            : 'border-border/50 bg-background/50',
                        )}
                      >
                        {ev.time && (
                          <p className="text-[9px] font-mono text-muted-foreground/50 tabular-nums">
                            {ev.time}
                          </p>
                        )}
                        <p className="text-[11px] font-medium text-foreground leading-snug">
                          {ev.event}
                        </p>
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
            ))}
          </div>
        </div>
      ))}

    </div>
  )
}
