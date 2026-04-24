/**
 * CloseSprintDialog — preview and confirm the Archive (Close Sprint) action
 *
 * Shows done and not-doing tasks that will be archived alongside the sprint
 * week label. Presents confirm/cancel actions.
 * Caller is responsible for the actual archive mutation on confirm.
 */

import { Archive } from 'lucide-react'
import { Button }  from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TaskSnapshotRow } from '@/components/tasks/TaskSnapshotRow'
import { formatWeekRange } from '@/lib/utils'
import type { ArchivedTask } from '@/lib/schemas'

interface Props {
  open:      boolean
  onClose:   () => void
  weekOf:    string
  done:      ArchivedTask[]
  notDoing:  ArchivedTask[]
  saving:    boolean
  onConfirm: () => void
}

export function CloseSprintDialog({
  open, onClose, weekOf, done, notDoing, saving, onConfirm,
}: Props) {
  const total = done.length + notDoing.length

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Close Sprint</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            WB {formatWeekRange(weekOf)}
            <span className="text-muted-foreground/50"> · {total} task{total !== 1 ? 's' : ''} will be archived</span>
          </p>
        </DialogHeader>

        {/* ── Task preview ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 grid grid-cols-2 divide-x divide-border">

          {/* Done */}
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-green-500/70 mb-2">
              Done ({done.length})
            </p>
            {done.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 italic py-2">No done tasks</p>
            ) : (
              done.map((task, i) => (
                <TaskSnapshotRow
                  key={`done-${task.id ?? 'null'}-${i}`}
                  snapshot={task}
                  accent="green"
                />
              ))
            )}
          </div>

          {/* Not Doing */}
          <div className="p-3 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
              Not Doing ({notDoing.length})
            </p>
            {notDoing.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 italic py-2">No not-doing tasks</p>
            ) : (
              notDoing.map((task, i) => (
                <TaskSnapshotRow
                  key={`not-${task.id ?? 'null'}-${i}`}
                  snapshot={task}
                  accent="muted"
                />
              ))
            )}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-card/50">
          <p className="flex-1 text-[11px] text-muted-foreground/40">
            Tasks are removed from the board and appended to archive.json
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={saving || total === 0}
            className="gap-1.5"
          >
            <Archive className="w-3.5 h-3.5" />
            {saving ? 'Archiving…' : 'Archive sprint'}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
