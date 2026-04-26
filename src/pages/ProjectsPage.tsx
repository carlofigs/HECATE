/**
 * ProjectsPage — Phase 3
 *
 * Layout: master-detail, two-column
 *   Left  (~240px): scrollable project list
 *   Right (flex-1): selected project detail
 *
 * Detail sections:
 *   1. Header   — name, subtitle, status badge, metadata row
 *   2. Callout  — currentFocus + nextAction
 *   3. Linked Tasks — live query from tasks.json by project tag
 *   4. Sections — collapsible markdown (NarrativeCard style)
 *   5. Open Questions — collapsible table
 *   6. Models   — collapsible table (when present)
 */

import { useState } from 'react'
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Search, X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDataFile } from '@/hooks/useDataFile'
import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'
import type { Project, OpenQuestion, Model, ProjectSection } from '@/lib/schemas'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  'active':      { label: 'Active',      dot: 'bg-green-500',  badge: 'text-green-600 bg-green-500/10 border-green-500/30 dark:text-green-400' },
  'in-progress': { label: 'In Progress', dot: 'bg-sky-500',    badge: 'text-sky-600 bg-sky-500/10 border-sky-500/30 dark:text-sky-400' },
  'paused':      { label: 'Paused',      dot: 'bg-amber-500',  badge: 'text-amber-600 bg-amber-500/10 border-amber-500/30 dark:text-amber-400' },
  'blocked':     { label: 'Blocked',     dot: 'bg-red-500',    badge: 'text-red-600 bg-red-500/10 border-red-500/30 dark:text-red-400' },
  'completed':   { label: 'Completed',   dot: 'bg-violet-500', badge: 'text-violet-600 bg-violet-500/10 border-violet-500/30 dark:text-violet-400' },
  'planned':     { label: 'Planned',     dot: 'bg-muted-foreground', badge: 'text-muted-foreground bg-muted/50 border-border' },
}

function statusCfg(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['planned']
}

// ─── Open Questions collapsible ───────────────────────────────────────────────

const OQ_STATUS: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  open:     { icon: <AlertCircle className="w-3 h-3" />, label: 'Open',     cls: 'text-amber-500' },
  resolved: { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Resolved', cls: 'text-green-500' },
  deferred: { icon: <Clock className="w-3 h-3" />,       label: 'Deferred', cls: 'text-muted-foreground' },
}

function OpenQuestionsSection({ questions }: { questions: OpenQuestion[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const openCount = questions.filter(q => q.status === 'open').length

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn(
          'w-3 h-3 text-amber-500/70 transition-transform duration-150 shrink-0',
          collapsed && '-rotate-90',
        )} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/70 flex-1 text-left">
          Open Questions
        </span>
        {openCount > 0 && (
          <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
            {openCount} open
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="divide-y divide-border/20">
          {questions.map(q => {
            const cfg = OQ_STATUS[q.status] ?? OQ_STATUS.open
            return (
              <div key={q.id} className="px-3 py-2.5 space-y-1">
                <div className="flex items-start gap-2">
                  {/* Blocker dot */}
                  {q.blocker && (
                    <span className="mt-[3px] w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Blocker" />
                  )}
                  {/* Status icon */}
                  <span className={cn('mt-[2px] shrink-0', cfg.cls)}>{cfg.icon}</span>
                  {/* Question */}
                  <p className="text-xs text-foreground leading-snug flex-1">{q.question}</p>
                  {/* ID + status */}
                  <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{q.id}</span>
                </div>
                {q.resolution && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-9">
                    {q.resolution}
                  </p>
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

const LAYER_ORDER = ['staging', 'intermediate', 'mart']
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
        <ChevronDown className={cn(
          'w-3 h-3 text-emerald-500/70 transition-transform duration-150 shrink-0',
          collapsed && '-rotate-90',
        )} />
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
                    <span className={cn(
                      'text-[10px] font-medium rounded px-1.5 py-0.5',
                      LAYER_COLOUR[m.layer] ?? 'text-muted-foreground bg-muted/50',
                    )}>
                      {m.layer}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationDev}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{m.materialisationProd}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'text-[10px] font-medium',
                      m.status === 'Done' ? 'text-green-500' : 'text-amber-500',
                    )}>
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
  const [collapsed, setCollapsed]   = useState(false)
  const { data: tasksData, loading } = useDataFile('tasks')

  const linked = (() => {
    if (!tasksData) return []
    const results: { colName: string; colType: string | null; taskTitle: string; taskId: string | null; note: string | null }[] = []
    for (const col of tasksData.columns) {
      for (const task of col.tasks) {
        if (task.tags.includes(tag)) {
          results.push({
            colName:   col.name,
            colType:   col.columnType ?? null,
            taskTitle: task.title,
            taskId:    task.id,
            note:      task.note ?? null,
          })
        }
      }
    }
    return results
  })()

  // Group by column
  const grouped = linked.reduce<Record<string, typeof linked>>((acc, t) => {
    ;(acc[t.colName] ??= []).push(t)
    return acc
  }, {})

  const COL_TYPE_ORDER: Record<string, number> = {
    'in-progress': 0,
    'done':        1,
    'not-doing':   2,
    'backlog':     3,
  }
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
        <ChevronDown className={cn(
          'w-3 h-3 text-sky-500/70 transition-transform duration-150 shrink-0',
          collapsed && '-rotate-90',
        )} />
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
            <div className="px-3 py-3 animate-pulse">
              <div className="h-3 bg-muted/40 rounded w-2/3" />
            </div>
          ) : linked.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground/40 italic">
              No tasks tagged #{tag}
            </p>
          ) : (
            <div className="divide-y divide-border/20">
              {sortedCols.map(colName => (
                <div key={colName}>
                  {/* Column sub-header */}
                  <p className={cn(
                    'px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-muted/10',
                    COL_TYPE_COLOUR[grouped[colName][0]?.colType ?? ''] ?? 'text-muted-foreground/50',
                  )}>
                    {colName}
                  </p>
                  {/* Tasks in column */}
                  <div className="divide-y divide-border/10">
                    {grouped[colName].map(t => (
                      <div key={t.taskId ?? t.taskTitle} className="flex items-center gap-2 px-3 py-1.5">
                        {t.colType === 'done' && <Check className="w-3 h-3 text-green-500/60 shrink-0" />}
                        {t.colType === 'in-progress' && <ChevronRight className="w-3 h-3 text-sky-500/60 shrink-0" />}
                        {t.colType !== 'done' && t.colType !== 'in-progress' && (
                          <span className="w-3 shrink-0" />
                        )}
                        {t.taskId && (
                          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 w-8 tabular-nums">
                            {displayId(t.taskId)}
                          </span>
                        )}
                        <span className="text-xs text-foreground/80 truncate">{t.taskTitle}</span>
                      </div>
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

// ─── Project Section (markdown, collapsible) ──────────────────────────────────

function ProjectSectionCard({ section }: { section: ProjectSection }) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors"
      >
        <ChevronDown className={cn(
          'w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0',
          collapsed && '-rotate-90',
        )} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1 text-left">
          {section.title}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 py-3 border-t border-border/40">
          {section.content.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/30 italic">No content</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Project Detail ───────────────────────────────────────────────────────────

function ProjectDetail({ project }: { project: Project }) {
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
            {/* Status badge */}
            <span className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border shrink-0 mt-0.5',
              cfg.badge,
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
          </div>

          {/* Metadata pills */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
            <span>Owner: <span className="text-foreground/80">{project.owner}</span></span>
            {project.phase && (
              <span>Phase: <span className="text-foreground/80">{project.phase}</span></span>
            )}
            {project.jira && (
              <span>Jira: <span className="font-mono text-foreground/80">{project.jira}</span></span>
            )}
            {project.branch && (
              <span className="hidden sm:inline">Branch: <span className="font-mono text-foreground/80 text-[10px]">{project.branch}</span></span>
            )}
            <span>Updated: <span className="text-foreground/80">{project.updatedAt}</span></span>
          </div>
        </div>

        {/* ── Focus / Next Action callout ── */}
        {(project.currentFocus || project.nextAction) && (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
            {project.currentFocus && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Current Focus</p>
                <p className="text-xs text-foreground/90 leading-relaxed">{project.currentFocus}</p>
              </div>
            )}
            {project.nextAction && (
              <div className={cn(project.currentFocus && 'pt-2 border-t border-sky-500/15')}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Next Action</p>
                <p className="text-xs text-foreground/90 leading-relaxed">{project.nextAction}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Linked Tasks ── */}
        <LinkedTasksSection tag={project.tag} />

        {/* ── Sections (markdown) ── */}
        {project.sections.map(section => (
          <ProjectSectionCard key={section.id} section={section} />
        ))}

        {/* ── Open Questions ── */}
        {project.openQuestions.length > 0 && (
          <OpenQuestionsSection questions={project.openQuestions} />
        )}

        {/* ── Models ── */}
        {project.models && project.models.length > 0 && (
          <ModelsSection models={project.models} />
        )}

      </div>
    </div>
  )
}

// ─── Project List (left panel) ────────────────────────────────────────────────

function ProjectList({
  projects,
  selectedId,
  onSelect,
  search,
  onSearch,
}: {
  projects:   Project[]
  selectedId: string | null
  onSelect:   (id: string) => void
  search:     string
  onSearch:   (v: string) => void
}) {
  const filtered = projects.filter(p =>
    search.trim() === '' ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.tag.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col border-r border-border bg-card/50 w-56 shrink-0">
      {/* Search */}
      <div className="px-2 py-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Filter…"
            className="w-full h-7 bg-muted/30 rounded pl-6 pr-6 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/40 hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground/40 italic">No projects match</p>
        ) : (
          filtered.map(p => {
            const cfg = statusCfg(p.status)
            const selected = p.id === selectedId
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-l-2 transition-colors',
                  selected
                    ? 'border-l-primary bg-primary/5'
                    : 'border-l-transparent hover:bg-muted/30',
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', cfg.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-xs font-medium leading-snug truncate',
                      selected ? 'text-foreground' : 'text-foreground/80',
                    )}>
                      {p.name}
                    </p>
                    {p.subtitle && (
                      <p className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5 line-clamp-2">
                        {p.subtitle}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/40 mt-1 font-mono">#{p.tag}</p>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: projectsData } = useDataFile('projects')

  const projects = projectsData?.projects ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,     setSearch]     = useState('')

  // Auto-select first project once data loads
  const resolvedId = selectedId ?? projects[0]?.id ?? null
  const selected   = projects.find(p => p.id === resolvedId) ?? null

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
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No projects yet
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <ProjectList
        projects={projects}
        selectedId={resolvedId}
        onSelect={setSelectedId}
        search={search}
        onSearch={setSearch}
      />

      {selected ? (
        <ProjectDetail project={selected} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a project
        </div>
      )}
    </div>
  )
}
