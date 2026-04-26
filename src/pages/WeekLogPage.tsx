/**
 * WeekLogPage — sprint week log: task snapshots + editable narrative
 *
 * Layout:
 *   Header: week selector (dropdown) · "Generate Week" button
 *   Body:
 *     Task snapshot grid  (Completed | Carried Forward | Delayed)
 *     Next Week           (editable list — one item per line)
 *     Narrative sections  (Meetings, Decisions, Frustrations)
 *     1:1 Prep            (per-person editable sections)
 *
 * Generate Week flow:
 *   Reads done / in-progress columns from tasks.json.
 *   in-progress + blockedSince → Delayed; in-progress without → Carried Forward.
 *   Shows GenerateWeekDialog for confirmation, then prepends to weekly_log.json.
 *   Navigates to the new week entry on success.
 *   Auto-triggers if navigated from Archive with { state: { fromArchive: true } }.
 */

import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarDays, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useDataFile } from '@/hooks/useDataFile'
import { useSettings } from '@/hooks/useSettings'
import { useInlineEdit } from '@/hooks/useInlineEdit'
import { TaskSnapshotRow } from '@/components/tasks/TaskSnapshotRow'
import { NarrativeCard } from '@/components/weeklog/NarrativeCard'
import { GenerateWeekDialog } from '@/components/weeklog/GenerateWeekDialog'
import { cn, formatWeekRange, currentMondayISO, nowISO } from '@/lib/utils'
import type { WeekEntry, TaskSnapshot } from '@/lib/schemas'

// ─── Task snapshot section (collapsible) ─────────────────────────────────────
// Collapsed by default — shows count chips only. Click header to expand full lists.
// Tags are suppressed (showTags=false) to keep rows readable without 3-column pressure.

interface TaskSnapshotSectionProps {
  completed:      TaskSnapshot[]
  carriedForward: TaskSnapshot[]
  delayed:        TaskSnapshot[]
}

function TaskSnapshotSection({ completed, carriedForward, delayed }: TaskSnapshotSectionProps) {
  const [sectionOpen, setSectionOpen]   = useState(false)
  // Single key for the open row: "<prefix>-<index>" e.g. "c-2", "cf-0", "d-1"
  const [expandedKey, setExpandedKey]   = useState<string | null>(null)

  const hasAny = completed.length + carriedForward.length + delayed.length > 0

  function toggle(key: string) {
    setExpandedKey(k => k === key ? null : key)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Collapsed header / section toggle ── */}
      <button
        onClick={() => { setSectionOpen(o => !o); setExpandedKey(null) }}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        aria-expanded={sectionOpen}
      >
        <div className="flex items-center gap-3 text-[11px]">
          <ChevronDown
            className={cn(
              'w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0',
              sectionOpen && 'rotate-180',
            )}
          />
          <span className="flex items-center gap-1">
            <span className="font-semibold text-green-500/80">{completed.length}</span>
            <span className="text-muted-foreground/50">done</span>
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <span className="font-semibold text-sky-500/80">{carriedForward.length}</span>
            <span className="text-muted-foreground/50">carried</span>
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <span className="font-semibold text-amber-500/70">{delayed.length}</span>
            <span className="text-muted-foreground/50">delayed</span>
          </span>
        </div>
      </button>

      {/* ── Expanded lists ── */}
      {sectionOpen && (
        <div className="border-t border-border/40">
          {!hasAny ? (
            <p className="px-3 py-3 text-xs text-muted-foreground/30 italic">No tasks recorded</p>
          ) : (
            <>
              {/* Completed */}
              {completed.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-500/60 bg-muted/10 border-b border-border/20">
                    ✓ Completed
                  </p>
                  <div className="divide-y divide-border/20">
                    {completed.map((t, i) => {
                      const key = `c-${i}`
                      return (
                        <TaskSnapshotRow
                          key={`c-${t.id ?? i}`}
                          snapshot={t}
                          accent="muted"
                          showId={false}
                          showTags={false}
                          expanded={expandedKey === key}
                          onToggle={() => toggle(key)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Carried Forward */}
              {carriedForward.length > 0 && (
                <div className={cn(completed.length > 0 && 'border-t border-border/30')}>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 bg-muted/10 border-b border-border/20">
                    → Carried Forward
                  </p>
                  <div className="divide-y divide-border/20">
                    {carriedForward.map((t, i) => {
                      const key = `cf-${i}`
                      return (
                        <TaskSnapshotRow
                          key={`cf-${t.id ?? i}`}
                          snapshot={t}
                          accent="muted"
                          showId={false}
                          showTags={false}
                          expanded={expandedKey === key}
                          onToggle={() => toggle(key)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Delayed */}
              {delayed.length > 0 && (
                <div className={cn((completed.length > 0 || carriedForward.length > 0) && 'border-t border-border/30')}>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/60 bg-muted/10 border-b border-border/20">
                    ⚠ Delayed
                  </p>
                  <div className="divide-y divide-border/20">
                    {delayed.map((t, i) => {
                      const key = `d-${i}`
                      return (
                        <TaskSnapshotRow
                          key={`d-${t.id ?? i}`}
                          snapshot={t}
                          accent="muted"
                          showId={false}
                          showTags={false}
                          expanded={expandedKey === key}
                          onToggle={() => toggle(key)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Next week editor ─────────────────────────────────────────────────────────

interface NextWeekEditorProps {
  items:    string[]
  onUpdate: (items: string[]) => void
}

function NextWeekEditor({ items, onUpdate }: NextWeekEditorProps) {
  const [collapsed, setCollapsed] = useState(true)

  const joined = items.join('\n')
  const splitAndUpdate = useCallback(
    (val: string) => onUpdate(val.split('\n').filter(l => l.trim() !== '')),
    [onUpdate],
  )
  const { editing, draft, setDraft, startEdit, commit, discard, onTextareaBlur, onTextareaKeyDown } =
    useInlineEdit(joined, splitAndUpdate)

  function handleStartEdit() {
    if (collapsed) setCollapsed(false)
    startEdit()
  }

  // Join items with double-newline so each renders as its own paragraph.
  // Users can write markdown directly (- bullets, **bold**, etc.).
  const markdown = items.join('\n\n')

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 bg-muted/20',
        !collapsed && 'border-b border-border/40',
      )}>
        <div
          className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
          onClick={editing ? undefined : () => setCollapsed(c => !c)}
        >
          {!editing && (
            <ChevronDown className={cn(
              'w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0',
              collapsed && '-rotate-90',
            )} />
          )}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-500/70">
            Next Week
          </h3>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        editing ? (
          <div className="p-3 space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={onTextareaBlur}
              onKeyDown={onTextareaKeyDown}
              placeholder="One item per line…"
              className="auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono focus:outline-none placeholder:text-muted-foreground/40 leading-relaxed min-h-[80px]"
            />
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground/40">One item per line · ⌘↵ save</span>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={discard} className="h-6 px-2 text-xs">Discard</Button>
                <Button size="sm" onMouseDown={e => { e.preventDefault(); commit() }} className="h-6 px-2 text-xs">Save</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 cursor-text min-h-[48px]" onClick={handleStartEdit} title="Click to edit">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground/30 italic">Empty — click to add next week's priorities</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

// ─── 1:1 per-person card ─────────────────────────────────────────────────────
// Defined here (above Page) so hooks are never called inside a .map() in JSX.

interface OneOnOneCardProps {
  weekOf:   string
  person:   string
  content:  string
  onUpdate: (person: string, content: string) => void
}

function OneOnOneCard({ weekOf, person, content, onUpdate }: OneOnOneCardProps) {
  const handleUpdate = useCallback(
    (c: string) => onUpdate(person, c),
    // weekOf in deps ensures the callback re-binds when the selected week changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekOf, person],
  )
  return (
    <NarrativeCard
      label={person}
      content={content}
      onUpdate={handleUpdate}
      minEditHeight={100}
      collapsible
      accent="text-teal-400/70"
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeekLogPage() {
  const location    = useLocation()
  const fromArchive = location.state?.fromArchive === true

  // ── Data ─────────────────────────────────────────────────────────────────
  const {
    data: logData,
    setData: setLog,
    save: saveLog,
  } = useDataFile('weekly_log')
  const { data: tasksData } = useDataFile('tasks')
  const { settings }        = useSettings()

  // ── Week navigation ───────────────────────────────────────────────────────
  const sortedWeeks: WeekEntry[] = logData
    ? [...logData.weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf))
    : []

  const [selectedWeekOf, setSelectedWeekOf] = useState<string | null>(null)

  // Default to most recent once data loads
  useEffect(() => {
    if (sortedWeeks.length > 0 && selectedWeekOf === null) {
      setSelectedWeekOf(sortedWeeks[0].weekOf)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedWeeks.length])

  // Guard: if selectedWeekOf no longer exists (e.g. after overwrite), reset to first
  const selectedWeek =
    sortedWeeks.find(w => w.weekOf === selectedWeekOf) ?? sortedWeeks[0] ?? null

  // ── Generate Week state ───────────────────────────────────────────────────
  const [generateOpen, setGenerateOpen] = useState(false)
  const [saving, setSaving]             = useState(false)

  const doneCols   = tasksData?.columns.filter(c => c.columnType === 'done')        ?? []
  const inProgCols = tasksData?.columns.filter(c => c.columnType === 'in-progress') ?? []
  const allInProg  = inProgCols.flatMap(c => c.tasks)

  const completedSnaps: TaskSnapshot[] = doneCols.flatMap(col =>
    col.tasks.map(t => ({ id: t.id, title: t.title, note: t.note, tags: t.tags })),
  )
  const carriedSnaps: TaskSnapshot[] = allInProg
    .filter(t => !t.blockedSince)
    .map(t => ({ id: t.id, title: t.title, note: t.note, tags: t.tags }))
  const delayedSnaps: TaskSnapshot[] = allInProg
    .filter(t => !!t.blockedSince)
    .map(t => ({ id: t.id, title: t.title, note: t.note, tags: t.tags }))

  const generateWeekOf = currentMondayISO()
  const weekExists     = sortedWeeks.some(w => w.weekOf === generateWeekOf)

  function handleOpenGenerate() {
    if (!tasksData) { toast.error('Tasks still loading — try again in a moment'); return }
    if (doneCols.length === 0 && inProgCols.length === 0) {
      toast.error('No Done or In-Progress columns configured', {
        description: 'Set column types in Settings → Column Types first.',
      })
      return
    }
    setGenerateOpen(true)
  }

  async function handleConfirmGenerate() {
    setSaving(true)
    try {
      const people    = settings.oneOnOnePeople
      const newEntry: WeekEntry = {
        weekOf:         generateWeekOf,
        dateRange:      formatWeekRange(generateWeekOf),
        generatedAt:    nowISO(),
        updatedAt:      nowISO(),
        completed:      completedSnaps,
        carriedForward: carriedSnaps,
        delayed:        delayedSnaps,
        nextWeek:       [],
        narrative: {
          meetingsAndDiscussions: '',
          decisionsMade:          '',
          frustrations:           '',
          oneOnOnePrep: {
            people,
            sections: Object.fromEntries(people.map(p => [p, ''])),
          },
        },
      }

      setLog(draft => {
        const existingIdx = draft.weeks.findIndex(w => w.weekOf === generateWeekOf)
        if (existingIdx >= 0) draft.weeks[existingIdx] = newEntry
        else draft.weeks.unshift(newEntry)
      })

      await saveLog('Generate week log')

      setGenerateOpen(false)
      setSelectedWeekOf(generateWeekOf)
      toast.success('Week log generated')
    } catch {
      toast.error('Failed to save — check your GitHub connection')
    } finally {
      setSaving(false)
    }
  }

  // Auto-trigger from Archive "Generate week log →" shortcut
  useEffect(() => {
    if (fromArchive && tasksData && !generateOpen) handleOpenGenerate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromArchive, !!tasksData])

  // ── Narrative update helpers ──────────────────────────────────────────────

  const updateField = useCallback(
    (field: 'meetingsAndDiscussions' | 'decisionsMade' | 'frustrations', content: string) => {
      if (!selectedWeek) return
      setLog(draft => {
        const w = draft.weeks.find(x => x.weekOf === selectedWeek.weekOf)
        if (w) { w.narrative[field] = content; w.updatedAt = nowISO() }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedWeek?.weekOf],
  )

  const onUpdateMeetings     = useCallback((c: string) => updateField('meetingsAndDiscussions', c), [updateField])
  const onUpdateDecisions    = useCallback((c: string) => updateField('decisionsMade', c),          [updateField])
  const onUpdateFrustrations = useCallback((c: string) => updateField('frustrations', c),            [updateField])

  const onUpdateNextWeek = useCallback(
    (items: string[]) => {
      if (!selectedWeek) return
      setLog(draft => {
        const w = draft.weeks.find(x => x.weekOf === selectedWeek.weekOf)
        if (w) { w.nextWeek = items; w.updatedAt = nowISO() }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedWeek?.weekOf],
  )

  const onUpdateOneOnOne = useCallback(
    (person: string, content: string) => {
      if (!selectedWeek) return
      setLog(draft => {
        const w = draft.weeks.find(x => x.weekOf === selectedWeek.weekOf)
        if (w) { w.narrative.oneOnOnePrep.sections[person] = content; w.updatedAt = nowISO() }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedWeek?.weekOf],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">

        {/* Week selector */}
        {sortedWeeks.length > 0 ? (
          <select
            value={selectedWeek?.weekOf ?? ''}
            onChange={e => setSelectedWeekOf(e.target.value)}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {sortedWeeks.map(w => (
              <option key={w.weekOf} value={w.weekOf}>
                WB {formatWeekRange(w.weekOf)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">No weeks yet</p>
        )}

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={handleOpenGenerate}
          disabled={saving}
        >
          <CalendarDays className="w-3 h-3" />
          Generate Week
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!logData ? (
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : !selectedWeek ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
            <CalendarDays className="w-8 h-8 opacity-20" />
            <p className="text-sm">No week logs yet</p>
            <p className="text-xs opacity-40">
              Close a sprint then generate the week log to get started.
            </p>
            <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={handleOpenGenerate}>
              <CalendarDays className="w-3.5 h-3.5" />
              Generate first week
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

            {/* Task snapshot — collapsible, no tags */}
            <TaskSnapshotSection
              completed={selectedWeek.completed}
              carriedForward={selectedWeek.carriedForward}
              delayed={selectedWeek.delayed}
            />

            {/* Next Week */}
            <NextWeekEditor
              items={selectedWeek.nextWeek}
              onUpdate={onUpdateNextWeek}
            />

            {/* Narrative sections */}
            <NarrativeCard
              label="Meetings & Discussions"
              content={selectedWeek.narrative.meetingsAndDiscussions}
              onUpdate={onUpdateMeetings}
              minEditHeight={160}
              collapsible
              accent="text-violet-400/70"
            />
            <NarrativeCard
              label="Decisions Made"
              content={selectedWeek.narrative.decisionsMade}
              onUpdate={onUpdateDecisions}
              collapsible
              accent="text-emerald-500/70"
            />
            <NarrativeCard
              label="Frustrations"
              content={selectedWeek.narrative.frustrations}
              onUpdate={onUpdateFrustrations}
              collapsible
              accent="text-rose-400/70"
            />

            {/* 1:1 Prep */}
            {selectedWeek.narrative.oneOnOnePrep.people.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-border/40" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 shrink-0">
                    1:1 Prep
                  </p>
                  <div className="flex-1 border-t border-border/40" />
                </div>
                {selectedWeek.narrative.oneOnOnePrep.people.map(person => (
                  <OneOnOneCard
                    key={`${selectedWeek.weekOf}-${person}`}
                    weekOf={selectedWeek.weekOf}
                    person={person}
                    content={selectedWeek.narrative.oneOnOnePrep.sections[person] ?? ''}
                    onUpdate={onUpdateOneOnOne}
                  />
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Generate Week Dialog */}
      <GenerateWeekDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        weekOf={generateWeekOf}
        completedCount={completedSnaps.length}
        carriedCount={carriedSnaps.length}
        delayedCount={delayedSnaps.length}
        weekExists={weekExists}
        saving={saving}
        onConfirm={handleConfirmGenerate}
      />
    </div>
  )
}
