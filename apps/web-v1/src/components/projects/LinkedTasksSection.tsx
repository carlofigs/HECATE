/**
 * LinkedTasksSection — live query of tasks.json by the project's tag,
 * grouped by column, with rows that navigate to the task.
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDataFile } from '@/hooks/useDataFile'
import { displayId } from '@/lib/taskConstants'

export function LinkedTasksSection({ tag }: { tag: string }) {
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
