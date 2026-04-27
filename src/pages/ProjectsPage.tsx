/**
 * ProjectsPage — Phase 3
 *
 * Layout: master-detail, two-column
 *   Left  (~224px): scrollable project list
 *   Right (flex-1): selected project detail
 *
 * Detail sections:
 *   1. Header         — name, subtitle, status (editable), metadata row + Jira chip
 *   2. Callout        — currentFocus + nextAction (inline-editable)
 *   3. Linked Tasks   — live query from tasks.json by project tag; rows navigate to task
 *   4. Roadmap        — clickable phase timeline + Gantt with tooltips
 *   5. Sections       — collapsible markdown with inline edit
 *   6. Open Questions — collapsible; toggle status, add resolution, add new question
 *   7. Models         — collapsible table
 *
 * All edits auto-stamp updatedAt and flow through the shared setData → auto-save.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock, GripVertical, Search, X, Pencil, Plus,
} from 'lucide-react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDataFile } from '@/hooks/useDataFile'
import { NewProjectDialog } from '@/components/projects/NewProjectDialog'
import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'
import type {
  Project, OpenQuestion, Model, ProjectSection,
  TimelineEntry, TimelineStatus,
} from '@/lib/schemas'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectUpdater = (p: Project) => void

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  'active':      { label: 'Active',      dot: 'bg-green-500',           badge: 'text-green-600 bg-green-500/10 border-green-500/30 dark:text-green-400'     },
  'in-progress': { label: 'In Progress', dot: 'bg-sky-500',             badge: 'text-sky-600 bg-sky-500/10 border-sky-500/30 dark:text-sky-400'             },
  'paused':      { label: 'Paused',      dot: 'bg-amber-500',           badge: 'text-amber-600 bg-amber-500/10 border-amber-500/30 dark:text-amber-400'     },
  'blocked':     { label: 'Blocked',     dot: 'bg-red-500',             badge: 'text-red-600 bg-red-500/10 border-red-500/30 dark:text-red-400'             },
  'completed':   { label: 'Completed',   dot: 'bg-violet-500',          badge: 'text-violet-600 bg-violet-500/10 border-violet-500/30 dark:text-violet-400' },
  'planned':     { label: 'Planned',     dot: 'bg-muted-foreground',    badge: 'text-muted-foreground bg-muted/50 border-border'                             },
}

function statusCfg(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['planned']
}

// ─── Inline text field ────────────────────────────────────────────────────────

/**
 * Click-to-edit field. Blurs → saves. Cmd/Ctrl+Enter → saves. Escape → discards.
 * Shows a faint pencil icon on hover in display mode.
 */
function InlineTextField({
  value,
  onSave,
  placeholder = 'Click to add…',
}: {
  value:       string | null
  onSave:      (v: string | null) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')

  function start() { setDraft(value ?? ''); setEditing(true) }
  function save()  { onSave(draft.trim() || null); setEditing(false) }
  function cancel(){ setEditing(false) }

  if (editing) {
    return (
      <div>
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
            if (e.key === 'Escape') cancel()
          }}
          className={cn(
            'auto-resize w-full resize-none bg-muted/20 rounded px-2 py-1',
            'text-xs text-foreground font-sans leading-relaxed',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-[10px] text-muted-foreground/30 mt-0.5">⌘↵ save · Esc discard</p>
      </div>
    )
  }

  return (
    <div
      className="group/itf cursor-text relative pr-5"
      onClick={start}
    >
      {value ? (
        <p className="text-xs text-foreground/90 leading-relaxed">{value}</p>
      ) : (
        <p className="text-xs text-muted-foreground/25 italic">{placeholder}</p>
      )}
      <Pencil className="absolute right-0 top-0 w-3 h-3 text-muted-foreground/25 opacity-0 group-hover/itf:opacity-100 transition-opacity" />
    </div>
  )
}

// ─── Open Questions ───────────────────────────────────────────────────────────

const OQ_STATUS_CFG: Record<OpenQuestion['status'], { icon: React.ReactNode; label: string; cls: string }> = {
  open:     { icon: <AlertCircle  className="w-3 h-3" />, label: 'Open',     cls: 'text-amber-500' },
  resolved: { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Resolved', cls: 'text-green-500' },
  deferred: { icon: <Clock        className="w-3 h-3" />, label: 'Deferred', cls: 'text-muted-foreground' },
}

const OQ_CYCLE: Record<OpenQuestion['status'], OpenQuestion['status']> = {
  open: 'resolved', resolved: 'deferred', deferred: 'open',
}

function OpenQuestionsSection({
  questions,
  onUpdate,
}: {
  questions: OpenQuestion[]
  onUpdate:  (fn: ProjectUpdater) => void
}) {
  const [collapsed,    setCollapsed]    = useState(false)
  const [addingNew,    setAddingNew]    = useState(false)
  const [newText,      setNewText]      = useState('')
  const [newBlocker,   setNewBlocker]   = useState(false)
  const [editingRes,   setEditingRes]   = useState<string | null>(null)  // oq id being resolved
  const [resDraft,     setResDraft]     = useState('')
  const addRef = useRef<HTMLTextAreaElement>(null)

  const openCount = questions.filter(q => q.status === 'open').length

  // Auto-focus new-question input when it appears
  useEffect(() => {
    if (addingNew) addRef.current?.focus()
  }, [addingNew])

  function cycleStatus(oqId: string, current: OpenQuestion['status']) {
    const next = OQ_CYCLE[current]
    onUpdate(p => {
      const q = p.openQuestions.find(q => q.id === oqId)
      if (!q) return
      q.status = next
      if (next !== 'resolved') q.resolution = null
    })
    // If moving to resolved, open the resolution editor
    if (next === 'resolved') {
      setEditingRes(oqId)
      setResDraft('')
    } else {
      if (editingRes === oqId) setEditingRes(null)
    }
  }

  function saveResolution(oqId: string) {
    onUpdate(p => {
      const q = p.openQuestions.find(q => q.id === oqId)
      if (q) q.resolution = resDraft.trim() || null
    })
    setEditingRes(null)
  }

  function submitNew() {
    const text = newText.trim()
    if (!text) return
    const id = `oq-${Date.now()}`
    onUpdate(p => {
      p.openQuestions.push({
        id, question: text, blocker: newBlocker, status: 'open', resolution: null,
      })
    })
    setNewText('')
    setNewBlocker(false)
    setAddingNew(false)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/10">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <ChevronDown className={cn('w-3 h-3 text-amber-500/70 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/70 truncate">
            Open Questions
          </span>
        </button>
        {openCount > 0 && (
          <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 shrink-0">
            {openCount} open
          </span>
        )}
        <button
          onClick={() => setAddingNew(v => !v)}
          className="p-1 rounded text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 transition-colors shrink-0"
          title="Add question"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Add-new form */}
      {addingNew && (
        <div className="px-3 py-2.5 border-t border-border/40 bg-amber-500/[0.02] space-y-2">
          <textarea
            ref={addRef}
            rows={2}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="What's the question…"
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitNew() }
              if (e.key === 'Escape') setAddingNew(false)
            }}
            className="auto-resize w-full resize-none bg-muted/20 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/30"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newBlocker}
                onChange={e => setNewBlocker(e.target.checked)}
                className="w-3 h-3 rounded accent-red-500"
              />
              <span className="text-[10px] text-muted-foreground">Blocker</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAddingNew(false)}
                className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitNew}
                disabled={!newText.trim()}
                className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Add
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/30">⌘↵ to add · Esc to cancel</p>
        </div>
      )}

      {/* Question list */}
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {questions.length === 0 && !addingNew && (
            <p className="px-3 py-3 text-xs text-muted-foreground/30 italic">No open questions</p>
          )}
          {questions.map(q => {
            const cfg = OQ_STATUS_CFG[q.status] ?? OQ_STATUS_CFG.open
            const isEditingRes = editingRes === q.id
            return (
              <div key={q.id} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  {/* Blocker dot */}
                  {q.blocker && (
                    <span className="mt-[4px] w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Blocker" />
                  )}
                  {/* Clickable status icon — cycles through states */}
                  <button
                    onClick={() => cycleStatus(q.id, q.status)}
                    className={cn('mt-[2px] shrink-0 hover:opacity-70 transition-opacity', cfg.cls)}
                    title={`${cfg.label} — click to change`}
                  >
                    {cfg.icon}
                  </button>
                  {/* Question text */}
                  <p className="text-xs text-foreground leading-snug flex-1">{q.question}</p>
                  {/* ID */}
                  <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{q.id}</span>
                </div>

                {/* Resolution area */}
                {(q.status === 'resolved' || q.resolution) && (
                  <div className="pl-9">
                    {isEditingRes ? (
                      <div className="space-y-1">
                        <textarea
                          autoFocus
                          rows={2}
                          value={resDraft}
                          onChange={e => setResDraft(e.target.value)}
                          placeholder="Resolution…"
                          onBlur={() => saveResolution(q.id)}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveResolution(q.id) }
                            if (e.key === 'Escape') setEditingRes(null)
                          }}
                          className="auto-resize w-full resize-none bg-muted/20 rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <p className="text-[10px] text-muted-foreground/30">⌘↵ save</p>
                      </div>
                    ) : (
                      <div
                        className="group/res cursor-text relative pr-4"
                        onClick={() => { setEditingRes(q.id); setResDraft(q.resolution ?? '') }}
                      >
                        {q.resolution ? (
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{q.resolution}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/30 italic">Add resolution…</p>
                        )}
                        <Pencil className="absolute right-0 top-0 w-2.5 h-2.5 text-muted-foreground/25 opacity-0 group-hover/res:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Models collapsible ───────────────────────────────────────────────────────

const LAYER_ORDER   = ['staging', 'intermediate', 'mart']
const LAYER_COLOUR: Record<string, string> = {
  staging:      'text-sky-500/70 bg-sky-500/10',
  intermediate: 'text-violet-500/70 bg-violet-500/10',
  mart:         'text-emerald-500/70 bg-emerald-500/10',
}

function ModelsSection({ models }: { models: Model[] }) {
  const [collapsed, setCollapsed] = useState(true)
  const sorted = [...models].sort(
    (a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer),
  )

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 text-emerald-500/70 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/70 flex-1 text-left">
          dbt Models
        </span>
        <span className="text-[10px] text-muted-foreground/50">{models.length}</span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/5">
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[200px]">Model</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[90px]">Layer</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Dev</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Prod</th>
                <th className="text-left px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[80px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {sorted.map(m => (
                <tr key={m.name} className="hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2 font-mono text-[11px] text-foreground/80">{m.name}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] font-medium rounded px-1.5 py-0.5', LAYER_COLOUR[m.layer] ?? 'text-muted-foreground bg-muted/50')}>
                      {m.layer}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationDev}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationProd}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] font-medium', m.status === 'Done' ? 'text-green-500' : 'text-amber-500')}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Linked Tasks ─────────────────────────────────────────────────────────────

function LinkedTasksSection({ tag }: { tag: string }) {
  const navigate  = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { data: tasksData, loading } = useDataFile('tasks')

  const linked = useMemo(() => {
    if (!tasksData) return []
    const results: {
      colName:   string
      colType:   string | null
      taskTitle: string
      taskId:    string | null
      note:      string | null
    }[] = []
    for (const col of tasksData.columns) {
      for (const task of col.tasks) {
        if (task.tags.includes(tag)) {
          results.push({ colName: col.name, colType: col.columnType ?? null, taskTitle: task.title, taskId: task.id, note: task.note ?? null })
        }
      }
    }
    return results
  }, [tasksData, tag])

  const grouped = linked.reduce<Record<string, typeof linked>>((acc, t) => {
    ;(acc[t.colName] ??= []).push(t)
    return acc
  }, {})

  const COL_TYPE_ORDER: Record<string, number> = { 'in-progress': 0, 'done': 1, 'not-doing': 2, 'backlog': 3 }
  const sortedCols = Object.keys(grouped).sort(
    (a, b) => (COL_TYPE_ORDER[grouped[a][0]?.colType ?? ''] ?? 9) - (COL_TYPE_ORDER[grouped[b][0]?.colType ?? ''] ?? 9),
  )

  const COL_TYPE_COLOUR: Record<string, string> = {
    'in-progress': 'text-sky-500/70',
    'done':        'text-green-500/60',
    'not-doing':   'text-muted-foreground/40',
    'backlog':     'text-muted-foreground/50',
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 text-sky-500/70 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-500/70 flex-1 text-left">
          Linked Tasks
        </span>
        {!loading && (
          <span className="text-[10px] text-muted-foreground/50">
            #{tag} · {linked.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div>
          {loading ? (
            <div className="px-3 py-3 animate-pulse"><div className="h-3 bg-muted/40 rounded w-2/3" /></div>
          ) : linked.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground/40 italic">No tasks tagged #{tag}</p>
          ) : (
            <div className="divide-y divide-border/20">
              {sortedCols.map(colName => (
                <div key={colName}>
                  <p className={cn('px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-muted/10', COL_TYPE_COLOUR[grouped[colName][0]?.colType ?? ''] ?? 'text-muted-foreground/50')}>
                    {colName}
                  </p>
                  <div className="divide-y divide-border/10">
                    {grouped[colName].map(t => (
                      <button
                        key={t.taskId ?? t.taskTitle}
                        onClick={() => t.taskId && navigate(`/tasks?open=${encodeURIComponent(t.taskId)}`)}
                        disabled={!t.taskId}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                          t.taskId ? 'hover:bg-muted/30 cursor-pointer' : 'cursor-default',
                        )}
                      >
                        {t.colType === 'done'        && <Check         className="w-3 h-3 text-green-500/60 shrink-0" />}
                        {t.colType === 'in-progress' && <ChevronRight  className="w-3 h-3 text-sky-500/60 shrink-0"   />}
                        {t.colType !== 'done' && t.colType !== 'in-progress' && <span className="w-3 shrink-0" />}
                        {t.taskId && (
                          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 w-8 tabular-nums">
                            {displayId(t.taskId)}
                          </span>
                        )}
                        <span className="text-xs text-foreground/80 truncate">{t.taskTitle}</span>
                        {t.taskId && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/20 shrink-0 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Project Section (markdown, collapsible, inline-editable) ─────────────────

function ProjectSectionCard({
  section,
  onUpdate,
}: {
  section:  ProjectSection
  onUpdate: (fn: ProjectUpdater) => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [draft,     setDraft]     = useState({ title: section.title, content: section.content })

  function startEdit(e: React.MouseEvent) { e.stopPropagation(); setDraft({ title: section.title, content: section.content }); setEditing(true); setCollapsed(false) }
  function save()    { onUpdate(p => { const s = p.sections.find(s => s.id === section.id); if (s) { s.title = draft.title.trim() || s.title; s.content = draft.content } }); setEditing(false) }
  function discard() { setEditing(false) }

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden p-3 space-y-2">
        <input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          className="w-full bg-transparent text-xs font-semibold text-foreground border-b border-border/50 pb-1 focus:outline-none focus:border-primary"
        />
        <textarea
          autoFocus
          value={draft.content}
          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') discard() }}
          className="auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono focus:outline-none leading-relaxed"
          rows={4}
        />
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground/40">⌘↵ save · Esc discard</span>
          <div className="flex items-center gap-1.5">
            <button onClick={discard} className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Discard</button>
            <button onClick={save}    className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Save</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <ChevronDown className={cn('w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1 text-left">
            {section.title}
          </span>
        </button>
        <button
          onClick={startEdit}
          className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          title="Edit section"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-3 border-t border-border/40 group">
          {section.content.trim() ? (
            <div className="relative">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
              </div>
              <button
                onClick={startEdit}
                className="absolute top-0 right-0 p-1 rounded text-muted-foreground/25 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <p
              className="text-xs text-muted-foreground/30 italic cursor-text"
              onClick={startEdit}
            >
              Empty — click to add content
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Roadmap (phase timeline + Gantt) ────────────────────────────────────────

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

function RoadmapSection({ timeline }: { timeline: TimelineEntry[] }) {
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

// ─── Project Detail ───────────────────────────────────────────────────────────

function ProjectDetail({
  project,
  onUpdate,
}: {
  project:  Project
  onUpdate: (fn: ProjectUpdater) => void
}) {
  const cfg = statusCfg(project.status)

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* ── Header ── */}
        <div className="space-y-2">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground leading-tight">{project.name}</h1>
              {project.subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{project.subtitle}</p>
              )}
            </div>

            {/* Status badge — transparent <select> overlaid so clicking the badge opens the dropdown */}
            <div className="relative shrink-0 mt-0.5" title="Click to change status">
              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border cursor-pointer select-none', cfg.badge)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <select
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[11px]"
                value={project.status}
                onChange={e => onUpdate(p => {
                  p.status = e.target.value as Project['status']
                })}
              >
                {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary — inline-editable paragraph */}
          <div className="border-t border-border/30 pt-2">
            <InlineTextField
              value={project.summary}
              placeholder="Add a summary — what is this project about?"
              onSave={v => onUpdate(p => { p.summary = v })}
            />
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
            <span>Owner: <span className="text-foreground/80">{project.owner}</span></span>
            {project.phase && (
              <span>Phase: <span className="text-foreground/80">{project.phase}</span></span>
            )}
            {project.jira && (
              <span className="inline-flex items-center gap-1">
                Jira:
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 dark:text-blue-300 ml-0.5">
                  {project.jira}
                </span>
              </span>
            )}
            {project.branch && (
              <span className="hidden sm:inline">Branch: <span className="font-mono text-foreground/80 text-[10px]">{project.branch}</span></span>
            )}
            <span>Updated: <span className="text-foreground/80">{project.updatedAt}</span></span>
          </div>
        </div>

        {/* ── Focus / Next Action callout (inline-editable) ── */}
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Current Focus</p>
            <InlineTextField
              value={project.currentFocus}
              placeholder="What's the current focus of this project?"
              onSave={v => onUpdate(p => { p.currentFocus = v })}
            />
          </div>
          {(project.currentFocus || project.nextAction) && (
            <div className="pt-2 border-t border-sky-500/15" />
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Next Action</p>
            <InlineTextField
              value={project.nextAction}
              placeholder="What's the immediate next action?"
              onSave={v => onUpdate(p => { p.nextAction = v })}
            />
          </div>
        </div>

        {/* ── Linked Tasks ── */}
        <LinkedTasksSection tag={project.tag} />

        {/* ── Open Questions (full CRUD) ── */}
        <OpenQuestionsSection questions={project.openQuestions} onUpdate={onUpdate} />

        {/* ── Roadmap ── */}
        {project.timeline.length > 0 && <RoadmapSection timeline={project.timeline} />}

        {/* ── Sections (markdown, inline-editable) ── */}
        {project.sections.map(section => (
          <ProjectSectionCard key={section.id} section={section} onUpdate={onUpdate} />
        ))}

        {/* ── Models ── */}
        {project.models && project.models.length > 0 && (
          <ModelsSection models={project.models} />
        )}
      </div>
    </div>
  )
}

// ─── Project List (left panel) ────────────────────────────────────────────────

/** Single sortable row inside the project list */
function SortableProjectItem({
  project,
  selectedId,
  onSelect,
  dragDisabled,
}: {
  project:     Project
  selectedId:  string | null
  onSelect:    (id: string) => void
  dragDisabled: boolean
}) {
  const cfg      = statusCfg(project.status)
  const selected = project.id === selectedId

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: dragDisabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/pi flex items-stretch border-l-2 transition-colors',
        selected ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/30',
      )}
    >
      {/* Drag handle */}
      {!dragDisabled && (
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="px-1 flex items-center text-muted-foreground/20 opacity-0 group-hover/pi:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}

      {/* Main clickable area */}
      <button
        onClick={() => onSelect(project.id)}
        className="flex-1 text-left px-3 py-2.5 min-w-0"
      >
        <div className="flex items-start gap-2">
          <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', cfg.dot)} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-medium leading-snug truncate', selected ? 'text-foreground' : 'text-foreground/80')}>
              {project.name}
            </p>
            {project.subtitle && (
              <p className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5 line-clamp-2">{project.subtitle}</p>
            )}
            <p className="text-[10px] text-muted-foreground/40 mt-1 font-mono">#{project.tag}</p>
          </div>
        </div>
      </button>
    </div>
  )
}

function ProjectList({
  projects, selectedId, onSelect, search, onSearch, onReorder, onNewProject,
}: {
  projects:      Project[]
  selectedId:    string | null
  onSelect:      (id: string) => void
  search:        string
  onSearch:      (v: string) => void
  onReorder:     (reordered: Project[]) => void
  onNewProject?: () => void
}) {
  const isFiltering = search.trim() !== ''

  const filtered = isFiltering
    ? projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.tag.toLowerCase().includes(search.toLowerCase()),
      )
    : projects

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = projects.findIndex(p => p.id === active.id)
    const newIdx = projects.findIndex(p => p.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(projects, oldIdx, newIdx))
  }

  return (
    <div className="flex flex-col border-r border-border bg-card/50 w-56 shrink-0">
      {/* Search + New */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border/50">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Filter…"
            className="w-full h-7 bg-muted/30 rounded pl-6 pr-6 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/40 hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {onNewProject && (
          <button
            onClick={onNewProject}
            title="New project"
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground/40 italic">No projects match</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {filtered.map(p => (
                <SortableProjectItem
                  key={p.id}
                  project={p}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  dragDisabled={isFiltering}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: projectsData, setData, error: projectsError, reload: reloadProjects } = useDataFile('projects')

  const projects    = projectsData?.projects ?? []
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [newProjectOpen,  setNewProjectOpen]  = useState(false)

  const resolvedId = selectedId ?? projects[0]?.id ?? null
  const selected   = projects.find(p => p.id === resolvedId) ?? null

  const handleUpdate = useCallback((fn: ProjectUpdater) => {
    if (!resolvedId) return
    setData(draft => {
      const p = draft.projects.find(pr => pr.id === resolvedId)
      if (!p) return
      fn(p)
      p.updatedAt = new Date().toISOString().slice(0, 10)
    })
  }, [resolvedId, setData])

  const handleReorder = useCallback((reordered: Project[]) => {
    setData(draft => { draft.projects = reordered })
  }, [setData])

  const handleCreate = useCallback((project: Project) => {
    setData(draft => { draft.projects.unshift(project) })
    setSelectedId(project.id)
    setNewProjectOpen(false)
  }, [setData])

  if (projectsError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load projects</p>
        <p className="text-xs opacity-60">{projectsError}</p>
        <button
          onClick={reloadProjects}
          className="mt-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!projectsData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 w-64">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <>
        <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">No projects yet</p>
          <button
            onClick={() => setNewProjectOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New project
          </button>
        </div>
        <NewProjectDialog
          open={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          onCreate={handleCreate}
          existing={projects}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex h-full overflow-hidden">
        <ProjectList
          projects={projects}
          selectedId={resolvedId}
          onSelect={setSelectedId}
          search={search}
          onSearch={setSearch}
          onReorder={handleReorder}
          onNewProject={() => setNewProjectOpen(true)}
        />
        {selected ? (
          <ProjectDetail project={selected} onUpdate={handleUpdate} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a project
          </div>
        )}
      </div>
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreate}
        existing={projects}
      />
    </>
  )
}
