/**
 * InlineTextField — click-to-edit field used across the project detail view.
 * Blur → save. Cmd/Ctrl+Enter → save. Escape → discard. Faint pencil on hover.
 */

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InlineTextField({
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
