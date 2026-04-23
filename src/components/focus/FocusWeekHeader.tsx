/**
 * FocusWeekHeader — week metadata bar at the top of the Focus view
 *
 * Shows: week date range, sprint label (editable), last updated timestamp.
 * Sprint label edit is inline — blur saves via onUpdate callback.
 */

import { useState, useRef } from 'react'
import { CalendarDays, Pencil, Check } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { FocusData } from '@/lib/schemas'

interface Props {
  data:     FocusData
  onUpdate: (updater: (d: FocusData) => void) => void
}

export function FocusWeekHeader({ data, onUpdate }: Props) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft,   setLabelDraft]   = useState(data.sprintLabel)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setLabelDraft(data.sprintLabel)
    setEditingLabel(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitLabel() {
    const trimmed = labelDraft.trim()
    if (trimmed && trimmed !== data.sprintLabel) {
      onUpdate(d => { d.sprintLabel = trimmed })
    }
    setEditingLabel(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commitLabel() }
    if (e.key === 'Escape') { setEditingLabel(false) }
  }

  // Derive human-readable week range from weekOf (Monday)
  const monday = new Date(data.weekOf)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const weekRange = `${formatDate(monday.toISOString())} – ${formatDate(friday.toISOString())}`

  return (
    <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50 flex flex-wrap items-center gap-x-4 gap-y-1">

      {/* Week range */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
        <span>{weekRange}</span>
      </div>

      {/* Sprint label — inline editable */}
      <div className="flex items-center gap-1.5">
        {editingLabel ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={onKeyDown}
              className={cn(
                'h-6 px-2 rounded border border-primary/50 bg-background text-xs text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-primary',
                'w-52',
              )}
            />
            <button
              onMouseDown={e => { e.preventDefault(); commitLabel() }}
              className="p-0.5 rounded text-primary hover:bg-primary/10"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 group"
            title="Edit sprint label"
          >
            <span className="text-xs font-medium text-foreground/80 font-mono">
              {data.sprintLabel}
            </span>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Last updated */}
      <span className="ml-auto text-xs text-muted-foreground/60 tabular-nums">
        Updated {formatDate(data.updatedAt)}
      </span>
    </div>
  )
}
