/**
 * WeekCalendarView — renders the "Week at a Glance" markdown table
 * as a visual day-column calendar.
 *
 * Parses the pipe-table from section.content, groups rows by day,
 * sorts days by date number, and renders each day as a card column.
 *
 * Task ID references in the Relevance column are rendered as TaskIdChips.
 * Today's column is highlighted. Edit mode falls back to the raw textarea.
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

interface DayGroup {
  label:  string   // e.g. "Tue 14"
  dateN:  number   // extracted date number for sorting
  events: CalEvent[]
}

// ─── Table parser ─────────────────────────────────────────────────────────────

function parseTable(markdown: string): DayGroup[] {
  const rows = markdown
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && !l.match(/^\|[-\s|]+\|$/))

  if (rows.length < 2) return [] // no header + data rows

  const dayMap = new Map<string, CalEvent[]>()
  const dayOrder: string[] = []

  for (const row of rows.slice(1)) { // skip header
    const cells = row.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    if (cells.length < 4) continue
    const [day, time, event, relevance] = cells
    if (!day || day === '—') continue

    if (!dayMap.has(day)) {
      dayMap.set(day, [])
      dayOrder.push(day)
    }
    // Only add if there's an actual event
    if (event && event !== '—') {
      dayMap.get(day)!.push({ time: time === '—' ? '' : time, event, relevance: relevance ?? '' })
    }
  }

  return dayOrder
    .map(label => ({
      label,
      dateN: parseInt(label.replace(/\D/g, ''), 10) || 0,
      events: dayMap.get(label) ?? [],
    }))
    .sort((a, b) => a.dateN - b.dateN)
}

// ─── Inline task ID chip renderer ─────────────────────────────────────────────

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

// ─── Today detection ──────────────────────────────────────────────────────────

function isToday(dateN: number): boolean {
  return dateN === new Date().getDate()
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  content:   string
  onEdit:    () => void
}

export function WeekCalendarView({ content, onEdit }: Props) {
  const days = useMemo(() => parseTable(content), [content])

  if (!days.length) {
    return (
      <p className="text-xs text-muted-foreground/40 italic cursor-text" onClick={onEdit}>
        No schedule data — click to edit
      </p>
    )
  }

  return (
    <div
      className="overflow-x-auto pb-1 cursor-default"
      onClick={e => e.stopPropagation()} // don't fall through to startEdit on card clicks
    >
      {/* Edit hint */}
      <div className="flex justify-end mb-2">
        <button
          onClick={onEdit}
          className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          Edit table →
        </button>
      </div>

      {/* Day columns */}
      <div className="flex gap-2 min-w-0">
        {days.map(day => {
          const today = isToday(day.dateN)
          return (
            <div
              key={day.label}
              className={cn(
                'flex flex-col min-w-[140px] flex-1 rounded-lg border overflow-hidden',
                today ? 'border-primary/40' : 'border-border',
              )}
            >
              {/* Day header */}
              <div
                className={cn(
                  'px-2.5 py-1.5 text-center',
                  today
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted/40 text-muted-foreground',
                )}
              >
                <p className={cn('text-[11px] font-semibold', today && 'text-primary')}>
                  {day.label}
                  {today && <span className="ml-1 text-[9px] opacity-70">TODAY</span>}
                </p>
              </div>

              {/* Events */}
              <div className="flex flex-col gap-1 p-1.5 bg-card/50 flex-1">
                {day.events.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/30 text-center py-2 italic">
                    Free
                  </p>
                ) : (
                  day.events.map((ev, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5 space-y-0.5"
                    >
                      {ev.time && (
                        <p className="text-[9px] text-muted-foreground/60 font-mono tabular-nums">
                          {ev.time}
                        </p>
                      )}
                      <p className="text-[11px] font-medium text-foreground leading-snug">
                        {ev.event}
                      </p>
                      {ev.relevance && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed flex flex-wrap gap-1 items-center">
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
  )
}
