/**
 * GenerateWeekDialog — preview and confirm Week Log generation
 *
 * Shows the target week + task snapshot counts from the current board.
 * Confirm → caller creates the WeekEntry in weekly_log.json.
 * Narrative sections start empty; the user fills them in afterwards.
 */

import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatWeekRange } from '@/lib/utils'

interface Props {
  open:            boolean
  onClose:         () => void
  weekOf:          string
  completedCount:  number
  carriedCount:    number
  delayedCount:    number
  /** True if a log entry for this week already exists (warn, don't block) */
  weekExists:      boolean
  saving:          boolean
  onConfirm:       () => void
}

export function GenerateWeekDialog({
  open, onClose, weekOf, completedCount, carriedCount, delayedCount,
  weekExists, saving, onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm flex flex-col gap-0 p-0">

        {/* ── Header ── */}
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground/60" />
            Generate Week Log
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            WB {formatWeekRange(weekOf)}
          </p>
        </DialogHeader>

        {/* ── Counts ── */}
        <div className="grid grid-cols-3 gap-px bg-border mx-4 my-4 rounded-md overflow-hidden border border-border">
          <div className="bg-card text-center py-3 space-y-0.5">
            <p className="text-2xl font-bold text-green-500">{completedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Done</p>
          </div>
          <div className="bg-card text-center py-3 space-y-0.5">
            <p className="text-2xl font-bold text-foreground">{carriedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Carried</p>
          </div>
          <div className="bg-card text-center py-3 space-y-0.5">
            <p className="text-2xl font-bold text-amber-500/80">{delayedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Delayed</p>
          </div>
        </div>

        {/* ── Warnings ── */}
        <div className="px-4 space-y-1.5 pb-3">
          {weekExists && (
            <p className="text-[11px] text-amber-500/80 bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-1.5">
              A log entry for this week already exists — this will overwrite it.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/40">
            Tasks snapshot from the current board. Narrative sections start empty.
          </p>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-card/50">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={saving}
            className="gap-1.5"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {saving ? 'Generating…' : weekExists ? 'Overwrite' : 'Generate'}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
