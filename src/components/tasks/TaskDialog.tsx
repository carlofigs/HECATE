/**
 * TaskDialog — create / edit a task
 *
 * Modes:
 *   create: task is null, columnId is set → adds to that column
 *   edit:   task is set, columnId is set → updates in place
 *
 * Fields: title, note, tags (space/comma separated), priority, blockedSince
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'
import { todayISO, nowISO, generateTaskId } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'
import type { Task, Priority, Column } from '@/lib/schemas'

interface Props {
  open:       boolean
  onClose:    () => void
  task:       Task | null       // null = create mode
  columnId:   string | null
  columns:    Column[]
  onCreate:   (columnId: string, task: Task) => void
  onUpdate:   (columnId: string, task: Task) => void
  onDelete:   (columnId: string, taskId: string) => void
  onMove:     (taskId: string, fromColumnId: string, toColumnId: string) => void
}

const PRIORITIES: { value: Priority | ''; label: string }[] = [
  { value: '',       label: 'None'   },
  { value: 'high',   label: 'High'   },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low'    },
]

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(Boolean)
}

export function TaskDialog({
  open, onClose, task, columnId, columns,
  onCreate, onUpdate, onDelete, onMove,
}: Props) {
  const isCreate = task === null

  const [title,       setTitle]       = useState('')
  const [note,        setNote]        = useState('')
  const [tagsRaw,     setTagsRaw]     = useState('')
  const [priority,    setPriority]    = useState<Priority | ''>('')
  const [blockedSince,setBlockedSince]= useState('')
  const [targetCol,   setTargetCol]   = useState(columnId ?? '')

  // Populate fields when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNote(task.note ?? '')
      setTagsRaw(task.tags.join(' '))
      setPriority(task.priority ?? '')
      setBlockedSince(task.blockedSince ?? '')
    } else {
      setTitle('')
      setNote('')
      setTagsRaw('')
      setPriority('')
      setBlockedSince('')
    }
    setTargetCol(columnId ?? columns[0]?.id ?? '')
  }, [task, columnId, columns, open])

  function buildTask(): Task {
    const now = nowISO()
    return {
      id:          task?.id ?? generateTaskId(),
      title:       title.trim(),
      note:        note.trim() || null,
      tags:        parseTags(tagsRaw),
      priority:    priority || null,
      blockedSince:blockedSince || null,
      createdAt:   task?.createdAt ?? now,
      updatedAt:   now,
    }
  }

  function handleSave() {
    if (!title.trim() || !targetCol) return
    const built = buildTask()
    if (isCreate) {
      onCreate(targetCol, built)
    } else {
      // Handle column move if column changed
      if (columnId && targetCol !== columnId) {
        onMove(built.id, columnId, targetCol)
      }
      onUpdate(targetCol, built)
    }
    onClose()
  }

  function handleDelete() {
    if (task && columnId) {
      onDelete(columnId, task.id)
      onClose()
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto" onKeyDown={onKeyDown}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-sm">
              {isCreate ? 'New task' : 'Edit task'}
            </DialogTitle>
            {!isCreate && task && (
              <span className="font-mono text-xs text-muted-foreground/50 shrink-0 select-all">
                {displayId(task.id)}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>

          {/* Column */}
          <div className="space-y-1.5">
            <Label htmlFor="task-col">Column</Label>
            <select
              id="task-col"
              value={targetCol}
              onChange={e => setTargetCol(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {columns.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>

          {/* Priority + Blocked row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as Priority | '')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-blocked">Blocked since</Label>
              <Input
                id="task-blocked"
                type="date"
                value={blockedSince}
                onChange={e => setBlockedSince(e.target.value)}
                max={todayISO()}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="task-tags">Tags</Label>
            <Input
              id="task-tags"
              value={tagsRaw}
              onChange={e => setTagsRaw(e.target.value)}
              placeholder="admin hermes a47  (space or comma separated)"
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="task-note">Note</Label>
            <Textarea
              id="task-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Additional context, markdown supported…"
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2">
          {!isCreate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
            {isCreate ? 'Add task' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
