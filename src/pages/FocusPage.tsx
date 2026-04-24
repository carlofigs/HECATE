/**
 * FocusPage — weekly focus view
 *
 * Layout:
 *   ┌─ FocusWeekHeader ─────────────────────────────────┐
 *   │  week range · sprint label · last updated          │
 *   └───────────────────────────────────────────────────┘
 *   ┌─ Scrollable section list ─────────────────────────┐
 *   │  FocusSectionCard × N                              │
 *   │  + Add section button                              │
 *   └───────────────────────────────────────────────────┘
 *
 * Editing: inline — click any card body to enter edit mode.
 * Persistence: useDataFile auto-saves 2s after any mutation.
 * updatedAt is stamped on every mutation.
 */

import { useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useDataFile } from '@/hooks/useDataFile'
import { useCollapsed } from '@/hooks/useCollapsed'
import { PageShell } from '@/components/layout/PageShell'
import { FocusWeekHeader } from '@/components/focus/FocusWeekHeader'
import { FocusSectionCard } from '@/components/focus/FocusSectionCard'
import { Button } from '@/components/ui/button'
import { nowISO } from '@/lib/utils'
import type { FocusData, FocusSection } from '@/lib/schemas'

function slugify(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function uniqueId(title: string, existing: FocusSection[]): string {
  const base = slugify(title) || 'section'
  const ids   = new Set(existing.map(s => s.id))
  let id = base, n = 2
  while (ids.has(id)) id = `${base}-${n++}`
  return id
}

export default function FocusPage() {
  const { data, loading, error, setData, reload } = useDataFile('focus')
  const { isCollapsed, toggle, collapseAll, expandAll, collapsedCount } =
    useCollapsed('hecate:focus:collapsed')

  // ── Mutate helpers (all stamp updatedAt) ──────────────────────────────────

  const updateSection = useCallback(
    (sectionId: string, updater: (s: FocusSection) => void) => {
      setData(draft => {
        const s = draft.sections.find(sec => sec.id === sectionId)
        if (s) { updater(s); draft.updatedAt = nowISO() }
      })
    },
    [setData],
  )

  const updateHeader = useCallback(
    (updater: (d: FocusData) => void) => {
      setData(draft => { updater(draft); draft.updatedAt = nowISO() })
    },
    [setData],
  )

  const deleteSection = useCallback(
    (sectionId: string) => {
      setData(draft => {
        draft.sections = draft.sections.filter(s => s.id !== sectionId)
        draft.updatedAt = nowISO()
      })
    },
    [setData],
  )

  const addSection = useCallback(() => {
    setData(draft => {
      const newSection: FocusSection = {
        id:      uniqueId('new-section', draft.sections),
        title:   'New section',
        content: '',
      }
      draft.sections.push(newSection)
      draft.updatedAt = nowISO()
    })
  }, [setData])

  // ── Skeleton tailored to Focus layout ────────────────────────────────────
  const FocusSkeleton = (
    <div className="p-4 space-y-3">
      {[80, 120, 60, 100].map((h, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className={`h-${Math.round(h / 20)} w-full rounded bg-muted/60 animate-pulse`} />
        </div>
      ))}
    </div>
  )

  return (
    <PageShell
      loading={loading}
      error={error}
      onRetry={reload}
      skeleton={FocusSkeleton}
    >
      {data && (
        <div className="flex flex-col h-full overflow-hidden">

          {/* Week header */}
          <FocusWeekHeader data={data} onUpdate={updateHeader} />

          {/* Section list */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
            {/* Collapse / expand all */}
            {data.sections.length > 1 && (
              <div className="flex justify-end">
                <button
                  onClick={() => collapsedCount > 0 ? expandAll() : collapseAll(data.sections.map(s => s.id))}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {collapsedCount > 0 ? 'Expand all' : 'Collapse all'}
                </button>
              </div>
            )}
            {data.sections.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="text-sm text-muted-foreground">No sections yet</p>
                <Button variant="outline" size="sm" onClick={addSection} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Add first section
                </Button>
              </div>
            )}

            {data.sections.map((section, index) => (
              <FocusSectionCard
                key={section.id}
                section={section}
                colorIndex={index}
                onUpdate={updater => updateSection(section.id, updater)}
                onDelete={() => deleteSection(section.id)}
                collapsed={isCollapsed(section.id)}
                onToggle={() => toggle(section.id)}
              />
            ))}

            {/* Add section */}
            {data.sections.length > 0 && (
              <button
                onClick={addSection}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add section
              </button>
            )}

            {/* Bottom padding so last card isn't flush with bottom nav on mobile */}
            <div className="h-4" />
          </div>
        </div>
      )}
    </PageShell>
  )
}
