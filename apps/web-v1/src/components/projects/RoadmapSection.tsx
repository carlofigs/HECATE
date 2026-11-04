/**
 * RoadmapSection — clickable phase timeline with a Gantt track and a "today" marker.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineEntry, TimelineStatus } from '@/lib/schemas'

const TIMELINE_CFG: Record<TimelineStatus, { dot: string; fill: string; bar: string; text: string; label: string }> = {
  completed: { dot: 'bg-green-500 text-white',              fill: 'bg-green-500',    bar: 'bg-green-500/70', text: 'text-green-600 dark:text-green-400',    label: 'Complete'    },
  active:    { dot: 'bg-amber-400 text-white',              fill: 'bg-amber-400/60', bar: 'bg-amber-400',    text: 'text-amber-600 dark:text-amber-400',    label: 'In Progress' },
  pending:   { dot: 'bg-muted text-muted-foreground',       fill: 'bg-transparent',  bar: 'bg-muted/40',     text: 'text-muted-foreground',                 label: 'Pending'     },
  deferred:  { dot: 'bg-muted/60 text-muted-foreground/60', fill: 'bg-transparent',  bar: 'bg-muted/20',     text: 'text-muted-foreground/50',              label: 'Deferred'    },
}

function toMs(s: string | null): number | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}
function fmtShort(ms: number) { return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }
function fmtDuration(sMs: number, eMs: number) { const d = Math.round((eMs - sMs) / 86_400_000); return d === 1 ? '1d' : `${d}d` }

export function RoadmapSection({ timeline }: { timeline: TimelineEntry[] }) {
  const [collapsed, setCollapsed] = useState(false)

  if (timeline.length === 0) return null

  // Build date bounds across all phases that have both start + end
  const allMs = timeline
    .flatMap(t => [toMs(t.start), toMs(t.end)])
    .filter((ms): ms is number => ms !== null)
  const minMs   = allMs.length ? Math.min(...allMs) : 0
  const maxMs   = allMs.length ? Math.max(...allMs) : 1
  const spanMs  = maxMs - minMs || 1
  const todayMs = Date.now()
  const todayPct = Math.max(0, Math.min(100, ((todayMs - minMs) / spanMs) * 100))
  const showToday   = allMs.length >= 2 && todayPct > 0 && todayPct < 100
  const showGantt   = allMs.length >= 2

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex-1 text-left">Roadmap</span>
        <span className="text-[10px] text-muted-foreground/40">{timeline.length} phases</span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 border-t border-border/40 space-y-2">
          {timeline.map((entry, idx) => {
            const cfg      = TIMELINE_CFG[entry.status]
            const sMs      = toMs(entry.start)
            const eMs      = toMs(entry.end)
            const hasDates = sMs !== null && eMs !== null
            const barLeft  = sMs !== null ? ((sMs - minMs) / spanMs * 100) : 0
            const barWidth = hasDates ? Math.max(1.5, (eMs! - sMs!) / spanMs * 100) : 0

            return (
              <div key={idx} className="space-y-1.5">
                {/* Phase row */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Numbered status dot */}
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', cfg.dot)}>
                    {idx + 1}
                  </div>
                  {/* Phase name */}
                  <p className={cn('text-[11px] font-medium flex-1 min-w-0', cfg.text)}>
                    {entry.phase}
                  </p>
                  {/* Date range + duration */}
                  {hasDates && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums whitespace-nowrap">
                      {fmtShort(sMs!)}
                      <span className="text-muted-foreground/30"> – </span>
                      {fmtShort(eMs!)}
                      <span className="text-muted-foreground/30 ml-1">· {fmtDuration(sMs!, eMs!)}</span>
                    </span>
                  )}
                  {sMs !== null && eMs === null && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">{fmtShort(sMs)} – TBD</span>
                  )}
                  {/* Status label */}
                  <span className={cn('text-[10px] font-medium shrink-0 w-[62px] text-right', cfg.text)}>{cfg.label}</span>
                </div>

                {/* Gantt bar track */}
                {showGantt && (
                  <div className="ml-7 relative h-1.5 rounded-full bg-muted/20">
                    {hasDates && (
                      <div
                        className={cn('absolute top-0 bottom-0 rounded-full', cfg.bar)}
                        style={{ left: `${barLeft.toFixed(1)}%`, width: `${barWidth.toFixed(1)}%` }}
                      />
                    )}
                    {showToday && (
                      <div
                        className="absolute top-[-4px] bottom-[-4px] w-px bg-amber-400/70 z-10"
                        style={{ left: `${todayPct.toFixed(1)}%` }}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Today label under Gantt */}
          {showToday && showGantt && (
            <div className="ml-7 relative h-3.5">
              <span
                className="absolute text-[9px] text-amber-400/80 font-medium -translate-x-1/2 leading-none"
                style={{ left: `${todayPct.toFixed(1)}%` }}
              >
                today
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
