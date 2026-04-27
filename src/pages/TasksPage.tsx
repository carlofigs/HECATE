/**
 * TasksPage — orchestrates both board and list views
 *
 * Owns:
 * - useDataFile('tasks')
 * - All CRUD handlers (create, update, delete, move)
 * - TaskDialog state
 * - View toggle (board | list), persisted to localStorage
 * - Toast notifications on mutations
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Kanban, LayoutList, Plus } from 'lucide-react'
import { useDataFile } from '@/hooks/useDataFile'
import { PageShell } from '@/components/layout/PageShell'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskListView } from '@/components/tasks/TaskListView'
import { TaskDialog } from '@/components/tasks/TaskDialog'
import { TagFilterBar } from '@/components/tasks/TagFilterBar'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { nowISO, generateTaskId } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { TASKS_VIEW_STORAGE_KEY } from '@/lib/taskConstants'
import type { Task, TasksData } from '@/lib/schemas'

type View = 'board' | 'list'

const BoardSkeleton = (
  <div className="flex gap-3 p-4 h-full overflow-hidden">
    {[4, 7, 2, 1].map((n, i) => (
      <div key={i} className="flex flex-col w-72 shrink-0 gap-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        {Array.from({ length: n }).map((_, j) => (
          <Skeleton key={j} className="h-14 w-full rounded-md" />
        ))}
      </div>
    ))}
  </div>
)

export default function TasksPage() {
  const { data, loading, error, setData, reload } = useDataFile('tasks')
  const [searchParams, setSearchParams] = useSearchParams()
  const autoOpenHandled = useRef(false)

  const [view, setView] = useState<View>(
    () => (localStorage.getItem(TASKS_VIEW_STORAGE_KEY) as View | null) ?? 'board',
  )
  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [dialogTask,  setDialogTask]  = useState<Task | null>(null)
  const [dialogColId, setDialogColId] = useState<string | null>(null)
  const [activeTags,  setActiveTags]  = useState<Set<string>>(new Set())

  function switchView(v: View) {
    setView(v)
    localStorage.setItem(TASKS_VIEW_STORAGE_KEY, v)
  }

  // ── Dialog openers ─────────────────────────────────────────────────────────

  const openEdit = useCallback((task: Task, columnId: string) => {
    setDialogTask(task)
    setDialogColId(columnId)
    setDialogOpen(true)
  }, [])

  const openNew = useCallback((columnId: string) => {
    setDialogTask(null)
    setDialogColId(columnId)
    setDialogOpen(true)
  }, [])

  // ── Keyboard shortcut: N → new task in first active column ───────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in an input / textarea / contenteditable
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        if (!data) return
        // Pick first non-done, non-not-doing column
        const col = data.columns.find(c => c.columnType !== 'done' && c.columnType !== 'not-doing')
                 ?? data.columns[0]
        if (col) openNew(col.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, openNew])

  // ── Auto-open from ?open=<taskId> (linked from TaskIdChip) ───────────────

  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || !data || autoOpenHandled.current) return
    autoOpenHandled.current = true

    for (const col of data.columns) {
      const task = col.tasks.find(t => t.id === openId)
      if (task) {
        openEdit(task, col.id)
        break
      }
    }
    // Remove the param from the URL so back-navigation works cleanly
    setSearchParams(p => { p.delete('open'); return p }, { replace: true })
  }, [data, searchParams, openEdit, setSearchParams])

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleCreate = useCallback((columnId: string, task: Task) => {
    setData(draft => {
      draft.columns.find(c => c.id === columnId)?.tasks.unshift(task)
    })
    toast.success('Task added')
  }, [setData])

  const handleUpdate = useCallback((columnId: string, task: Task) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      if (!col) return
      const idx = col.tasks.findIndex(t => t.id === task.id)
      if (idx !== -1) col.tasks[idx] = task
    })
    toast.success('Task saved')
  }, [setData])

  const handleDelete = useCallback((columnId: string, taskId: string) => {
    setData(draft => {
      const col = draft.columns.find(c => c.id === columnId)
      if (col) col.tasks = col.tasks.filter(t => t.id !== taskId)
    })
    toast.success('Task deleted')
  }, [setData])

  const handleMove = useCallback((taskId: string, fromColId: string, toColId: string) => {
    setData(draft => {
      const src  = draft.columns.find(c => c.id === fromColId)
      const dest = draft.columns.find(c => c.id === toColId)
      if (!src || !dest) return
      const idx = src.tasks.findIndex(t => t.id === taskId)
      if (idx === -1) return
      const [task] = src.tasks.splice(idx, 1)
      task.updatedAt = nowISO()
      dest.tasks.push(task)
    })
  }, [setData])

  const handleQuickAdd = useCallback((columnId: string, title: string) => {
    const now = nowISO()
    setData(draft => {
      draft.columns.find(c => c.id === columnId)?.tasks.unshift({
        id: generateTaskId(), title,
        note: null, tags: [], priority: null,
        blockedSince: null, createdAt: now, updatedAt: now,
      })
    })
    toast.success('Task added')
  }, [setData])

  // ── Tag filter ────────────────────────────────────────────────────────────

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    data?.columns.forEach(col => col.tasks.forEach(t => t.tags.forEach(tag => tags.add(tag))))
    return [...tags].sort()
  }, [data])

  const filteredData = useMemo((): TasksData | null => {
    if (!data || activeTags.size === 0) return data
    return {
      ...data,
      columns: data.columns.map(col => ({
        ...col,
        tasks: col.tasks.filter(t => t.tags.some(tag => activeTags.has(tag))),
      })),
    }
  }, [data, activeTags])

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  // ── Header actions ─────────────────────────────────────────────────────────

  const firstColId = data?.columns[0]?.id ?? null

  const actions = (
    <div className="flex items-center gap-1.5">
      {/* New task */}
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 gap-1 text-xs"
        onClick={() => firstColId && openNew(firstColId)}
        disabled={!firstColId}
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">New task</span>
      </Button>

      {/* View toggle */}
      <div className="flex items-center rounded-md border border-border overflow-hidden">
        <button
          onClick={() => switchView('board')}
          className={cn(
            'p-1.5 transition-colors',
            view === 'board'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
          title="Board view"
        >
          <Kanban className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => switchView('list')}
          className={cn(
            'p-1.5 transition-colors',
            view === 'list'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
          title="List view"
        >
          <LayoutList className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <>
      <PageShell
        loading={loading}
        error={error}
        onRetry={reload}
        skeleton={BoardSkeleton}
        title="Tasks"
        actions={actions}
      >
        {data && filteredData && (
          <div className="flex flex-col h-full overflow-hidden">
            <TagFilterBar
              allTags={allTags}
              active={activeTags}
              onToggle={toggleTag}
              onClear={() => setActiveTags(new Set())}
            />
            {view === 'board'
              ? <TaskBoard
                  data={filteredData}
                  setData={setData}
                  onTaskClick={openEdit}
                  onQuickAdd={handleQuickAdd}
                />
              : <TaskListView
                  columns={filteredData.columns}
                  onTaskClick={openEdit}
                  onNewTask={openNew}
                  onQuickAdd={handleQuickAdd}
                />
            }
          </div>
        )}
      </PageShell>

      {data && (
        <TaskDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          task={dialogTask}
          columnId={dialogColId}
          columns={data.columns}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}
    </>
  )
}
