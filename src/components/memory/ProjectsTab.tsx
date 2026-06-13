/**
 * ProjectsTab — left list of project summaries + right markdown render.
 */

import { useState, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectSummary } from '@/lib/schemas'
import { Prose, SortToggle, toggleDir, type SortDir } from './memoryShared'

export function ProjectsTab({ projects }: { projects: ProjectSummary[] }) {
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() =>
    [...projects].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return sortDir === 'asc' ? cmp : -cmp
    }),
  [projects, sortDir])

  const [selected, setSelected] = useState<string>(sorted[0]?.name ?? '')
  const current = projects.find(p => p.name === selected)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: project list ── */}
      <div className="w-44 shrink-0 border-r border-border flex flex-col bg-card/30">
        <div className="shrink-0 flex items-center justify-end px-2 py-1.5 border-b border-border/50">
          <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sorted.map(p => (
            <button
              key={p.name}
              onClick={() => setSelected(p.name)}
              className={cn(
                'w-full flex items-start gap-1.5 px-3 py-1.5 text-left transition-colors text-[11px] leading-snug',
                selected === p.name
                  ? 'bg-primary/8 text-primary border-r-2 border-r-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
              )}
            >
              <FileText className="w-3 h-3 shrink-0 opacity-50 mt-px" />
              <span className="break-words min-w-0">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: rendered summary ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {current ? (
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-foreground mb-3">{current.name}</p>
            <Prose content={current.summary} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            Select a project from the list
          </p>
        )}
      </div>
    </div>
  )
}
