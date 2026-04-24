/**
 * WeekCalendarView — renders the "Week at a Glance" markdown table as a
 * Mon–Fri calendar grid, one row per week.
 *
 * Layout:
 *   Week row 1:  Mon  Tue  Wed  Thu  Fri
 *   Week row 2:  Mon  Tue  Wed  Thu  Fri
 *
 * - All 5 weekday columns always shown, even if empty
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

/** Key = "YYYY-MM-DD" or just a computed integer date for lookup */
interface DayCell {
  dayName:  string   // Mon | Tue | Wed | Thu | Fri
  dateN:    number   // calendar date number
  label:    string   // original label e.g. "Mon 20"
  events:   CalEvent[]
  isToday:  boolean
}

interface WeekRow {
  mondayDate: number
  weekNum:    number
  cells: DayCell[]   // always 5 items, Mon–Fri
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DOW_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

// ─── Table parser ─────────────────────────────────────────────────────────────

interface ParsedRow {
  label:    string
  dayName:  string
  dateN:    number
  time:     string
  event:    string
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

      const parts  = label.split(' ')
      const dayName = parts[0] ?? ''
      const dateN   = parseInt(parts[1] ?? '', 10)
      if (!DOW_NAMES.includes(dayName) || isNaN(dateN)) return []

      return [{ label, dayName, dateN, time: time === '—' ? '' : (time ?? ''), event: event ?? '', relevance: relevance ?? '' }]
    })
}

// ─── Week builder ─────────────────────────────────────────────────────────────

function buildWeeks(rows: ParsedRow[], weekOf: string): WeekRow[] {
  // Anchor: find today's date and the focus week's starting Monday
  const anchor = new Date(`${weekOf}T00:00`)
  // Offset anchor to Monday of that week
  const anchorDow = anchor.getDay() === 0 ? 6 : anchor.getDay() - 1 // 0=Mon
  const anchorMonday = new Date(anchor)
  anchorMonday.setDate(anchor.getDate() - anchorDow)

  const todayDate = new Date().getDate()
  const todayMonth = new Date().getMonth()

  // Group events by their computed Monday date
  const weekMap = new Map<number, Map<number, CalEvent[]>>()

  for (const row of rows) {
    if (!row.event || row.event === '—') continue
    const dow = DOW_INDEX[row.dayName] ?? 0
    const mondayDate = row.dateN - dow

    if (!weekMap.has(mondayDate)) weekMap.set(mondayDate, new Map())
    const dayMap = weekMap.get(mondayDate)!
    if (!dayMap.has(row.dateN)) dayMap.set(row.dateN, [])
    dayMap.get(row.dateN)!.push({
      time:      row.time,
      event:     row.event,
      relevance: row.relevance,
    })
  }

  // If no events parsed, synthesise one week from weekOf
  if (weekMap.size === 0) {
    weekMap.set(anchorMonday.getDate(), new Map())
  }

  const anchorMonth = anchorMonday.getMonth()

  // Build WeekRow for each Monday found, sorted ascending
  return [...weekMap.keys()].sort((a, b) => a - b).map(mondayDate => {
    // Reconstruct the actual Date for this Monday to get ISO week number
    const thisMonday = new Date(anchorMonday)
    thisMonday.setDate(anchorMonday.getDate() + (mondayDate - anchorMonday.getDate()))
    const weekNum = isoWeekNumber(thisMonday)

    const cells: DayCell[] = DOW_NAMES.map((dayName, i) => {
      const dateN = mondayDate + i
      const sameMonth = anchorMonth === todayMonth
      const isToday = sameMonth && dateN === todayDate
      return {
        dayName,
        dateN,
        label: `${dayName} ${dateN}`,
        events: weekMap.get(mondayDate)?.get(dateN) ?? [],
        isToday,
      }
    })
    return { mondayDate, weekNum, cells }
  })
}

// ─── ISO week number ──────────────────────────────────────────────────────────

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
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
    <div className="space-y-3" onClick={e => e.stopPropagation()}>
      {/* Edit hint */}
      <div className="flex justify-end">
        <button
          onClick={onEdit}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          Edit table →
        </button>
      </div>

      {weeks.map(week => (
        <div key={week.mondayDate} className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5">
          {/* Rotated week number */}
          <div className="flex items-center justify-center shrink-0 w-5">
            <span
              className="text-[9px] font-semibold text-muted-foreground/40 tracking-widest uppercase select-none"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              W{week.weekNum}
            </span>
          </div>
          <div className="flex gap-1.5 flex-1 min-w-[520px]">
            {week.cells.map(cell => (
              <div
                key={cell.dayName}
                className={cn(
                  'flex flex-col flex-1 min-w-0 rounded-lg border overflow-hidden',
                  cell.isToday ? 'border-primary/50' : 'border-border',
                )}
              >
                {/* Day header */}
                <div
                  className={cn(
                    'px-2 py-1 text-center shrink-0',
                    cell.isToday
                      ? 'bg-primary/15'
                      : 'bg-muted/40',
                  )}
                >
                  <span className={cn(
                    'text-[10px] font-semibold',
                    cell.isToday ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    {cell.dayName}
                  </span>
                  <span className={cn(
                    'ml-1 text-[10px]',
                    cell.isToday ? 'text-primary/70' : 'text-muted-foreground/50',
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
