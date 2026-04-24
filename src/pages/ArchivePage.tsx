/**
 * ArchivePage — sprint archive history + Close Sprint action
 *
 * Layout:
 *   Header: "Archive" title · sprint count · "Close Sprint" button
 *   Body:   Sorted archive weeks (most-recent first), each collapsible,
 *           showing done (green accent) and not-doing task rows.
 *
 * Close Sprint flow:
 *   1. Reads done / not-doing typed columns from tasks.json
 *   2. Previews them in CloseSprintDialog
 *   3. On confirm: prepends ArchiveWeek to archive.json, clears those
 *      columns in tasks.json, explicitly saves both files
 *   4. Toast with shortcut to "Generate week log"
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDataFile } from '@/hooks/useDataFile'
import { useDataStore } from '@/store/useDataStore'
import { TaskSnapshotRow } from '@/components/tasks/TaskSnapshotRow'
import { CloseSprintDialog } from '@/components/archive/CloseSprintDialog'
import { cn, formatWeekRange, currentMondayISO, nowISO } from '@/lib/utils'
import type { ArchivedTask, ArchiveWeek } from '@/lib/schemas'

// ─── Week row ─────────────────────────────────────────────────────────────────

interface WeekRowProps {
  week:      ArchiveWeek
  expanded:  boolean
  onToggle:  () => void
}

function WeekRow({ week, expanded, onToggle }: WeekRowProps) {
  const doneCount     = week.done.length
  const notDoingCount = week.notDoing.length

  return (
    <div className={cn(
      'rounded-lg border border-border bg-card overflow-hidden transition-shadow',
      expanded && 'shadow-sm',
    )}>

      {/* ── Collapsible header ── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
      >
        {expanded
          ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        }

        <span className="flex-1 min-w-0 text-xs font-semibold text-foreground">
          WB {formatWeekRange(week.weekOf)}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          {doneCount > 0 && (
            <span className="text-[10px] font-medium text-green-500/70">
              {doneCount} done
            </span>
          )}
          {notDoingCount > 0 && (
            <span className="text-[10px] font-medium text-muted-foreground/40">
              {notDoingCount} not doing
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/25">
            {new Date(week.archivedAt).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>
        </div>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-border">
          {week.done.length > 0 && (
            <div className="p-3 space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-green-500/60 mb-2">
                Done
              </p>
              {week.done.map((task, i) => (
                <TaskSnapshotRow
                  key={`done-${task.id ?? 'null'}-${i}`}
                  snapshot={task}
                  accent="green"
                />
              ))}
            </div>
          )}

          {week.done.length > 0 && week.notDoing.length > 0 && (
            <div className="border-t border-border/40 mx-3" />
          )}

          {week.notDoing.length > 0 && (
            <div className="p-3 space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/35 mb-2">
                Not Doing
              </p>
              {week.notDoing.map((task, i) => (
                <TaskSnapshotRow
                  key={`not-${task.id ?? 'null'}-${i}`}
                  snapshot={task}
                  accent="muted"
                />
              ))}
            </div>
          )}

          {week.done.length === 0 && week.notDoing.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground/30 italic">
              No tasks archived this week.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const navigate = useNavigate()

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: archiveData, setData: setArchive } = useDataFile('archive')
  const { data: tasksData,   setData: setTasks   } = useDataFile('tasks')

  // Access saveFile directly to avoid the extra "N saved" toasts from the wrapper
  const saveFile = useDataStore(s => s.saveFile)

  // ── Local state ────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{
    done:     ArchivedTask[]
    notDoing: ArchivedTask[]
    weekOf:   string
  } | null>(null)

  const toggleWeek = useCallback((weekOf: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(weekOf)) next.delete(weekOf)
      else next.add(weekOf)
      return next
    })
  }, [])

  // ── Close Sprint ────────────────────────────────────────────────────────────

  function handleOpenCloseSprint() {
    if (!tasksData) {
      toast.error('Tasks still loading — try again in a moment')
      return
    }

    const doneCols     = tasksData.columns.filter(c => c.columnType === 'done')
    const notDoingCols = tasksData.columns.filter(c => c.columnType === 'not-doing')

    if (doneCols.length === 0 && notDoingCols.length === 0) {
      toast.error('No Done or Not-Doing columns configured', {
        description: 'Set column types in Settings → Column Types first.',
      })
      return
    }

    const done: ArchivedTask[] = doneCols.flatMap(col =>
      col.tasks.map(t => ({
        id:             t.id,
        title:          t.title,
        note:           t.note,
        tags:           t.tags,
        originalColumn: col.name,
      })),
    )

    const notDoing: ArchivedTask[] = notDoingCols.flatMap(col =>
      col.tasks.map(t => ({
        id:             t.id,
        title:          t.title,
        note:           t.note,
        tags:           t.tags,
        originalColumn: col.name,
      })),
    )

    setPreview({ done, notDoing, weekOf: currentMondayISO() })
    setDialogOpen(true)
  }

  async function handleConfirmClose() {
    if (!preview || !tasksData || !archiveData) return
    setSaving(true)

    try {
      const archiveWeek: ArchiveWeek = {
        weekOf:     preview.weekOf,
        archivedAt: nowISO(),
        done:       preview.done,
        notDoing:   preview.notDoing,
      }

      // 1. Prepend to archive (most-recent first in the array)
      setArchive(draft => {
        draft.weeks.unshift(archiveWeek)
      })

      // 2. Clear done/not-doing columns in tasks
      setTasks(draft => {
        draft.columns.forEach(col => {
          if (col.columnType === 'done' || col.columnType === 'not-doing') {
            col.tasks = []
          }
        })
      })

      // 3. Explicit save — bypass auto-save debounce for a critical action
      await Promise.all([
        saveFile('archive', 'archive: close sprint'),
        saveFile('tasks',   'tasks: clear done/not-doing columns'),
      ])

      // 4. Auto-expand the new week entry
      setExpanded(prev => new Set([...prev, archiveWeek.weekOf]))

      setDialogOpen(false)
      setPreview(null)

      toast.success('Sprint archived', {
        action: {
          label:   'Generate week log →',
          onClick: () => navigate('/weeklog', { state: { fromArchive: true } }),
        },
      })
    } catch {
      toast.error('Archive failed — check your GitHub connection and retry')
    } finally {
      setSaving(false)
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const sortedWeeks = archiveData
    ? [...archiveData.weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf))
    : []

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-muted-foreground/60" />
          <h1 className="text-sm font-semibold text-foreground">Archive</h1>
          {archiveData && sortedWeeks.length > 0 && (
            <span className="text-[11px] text-muted-foreground/35">
              {sortedWeeks.length} sprint{sortedWeeks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs"
          onClick={handleOpenCloseSprint}
          disabled={saving}
        >
          <Archive className="w-3 h-3" />
          Close Sprint
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!archiveData ? (
          /* Loading skeleton */
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-11 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sortedWeeks.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
            <Archive className="w-8 h-8 opacity-20" />
            <p className="text-sm">No archived sprints yet</p>
            <p className="text-xs opacity-40">
              Close a sprint to snapshot your done tasks here.
            </p>
          </div>
        ) : (
          /* Week list */
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
            {sortedWeeks.map(week => (
              <WeekRow
                key={week.weekOf}
                week={week}
                expanded={expanded.has(week.weekOf)}
                onToggle={() => toggleWeek(week.weekOf)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Close Sprint Dialog ── */}
      {preview && (
        <CloseSprintDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setPreview(null) }}
          weekOf={preview.weekOf}
          done={preview.done}
          notDoing={preview.notDoing}
          saving={saving}
          onConfirm={handleConfirmClose}
        />
      )}

    </div>
  )
}
