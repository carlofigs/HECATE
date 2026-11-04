/**
 * RecurringTab — recurring responsibilities, sortable by name or cadence.
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Responsibility } from '@/lib/schemas'
import { Prose, SortToggle, toggleDir, type SortDir } from './memoryShared'

type RecurringSortBy = 'name' | 'cadence'

const CADENCE_COLOUR: Record<string, string> = {
  Weekly:      'text-primary bg-primary/10 border-primary/20',
  Monthly:     'text-violet-500 bg-violet-500/10 border-violet-500/20',
  'As needed': 'text-muted-foreground bg-muted/40 border-border',
}

const CADENCE_ORDER: Record<string, number> = {
  Weekly: 0, Monthly: 1, 'As needed': 2,
}

export function RecurringTab({ responsibilities }: { responsibilities: Responsibility[] }) {
  const [sortBy,  setSortBy]  = useState<RecurringSortBy>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() =>
    [...responsibilities].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        const ao = CADENCE_ORDER[a.cadence] ?? 99
        const bo = CADENCE_ORDER[b.cadence] ?? 99
        cmp = ao !== bo ? ao - bo : a.name.localeCompare(b.name)
      }
      return sortDir === 'asc' ? cmp : -cmp
    }),
  [responsibilities, sortBy, sortDir])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-card/30">
        <span className="text-[11px] text-muted-foreground/50 shrink-0">Sort by</span>
        <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
          {(['name', 'cadence'] as RecurringSortBy[]).map(opt => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={cn(
                'px-2.5 py-1 text-[11px] capitalize transition-colors',
                sortBy === opt
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-3 max-w-2xl mx-auto px-4 py-4">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground/40 italic text-center py-8">
              No recurring responsibilities logged
            </p>
          ) : sorted.map(r => (
            <div key={r.name} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-foreground flex-1 min-w-0">{r.name}</p>
                <span
                  className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                    CADENCE_COLOUR[r.cadence] ?? 'text-muted-foreground bg-muted/40 border-border',
                  )}
                >
                  {r.cadence}
                </span>
              </div>
              {r.notes && <Prose content={r.notes} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
