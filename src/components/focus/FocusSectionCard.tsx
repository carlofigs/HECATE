/**
 * FocusSectionCard — single focus section (display + inline edit)
 *
 * Display mode: section title + rendered GFM markdown
 * Edit mode:    title input + full-height textarea
 *
 * Transitions:
 * - Click anywhere on the card body (or the pencil icon) → edit mode
 * - Cmd/Ctrl+Enter or the Save button → commit + exit edit
 * - Escape → discard + exit edit
 * - Blur from textarea (after 150ms debounce) → commit silently
 */

import { useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Pencil, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FocusSection } from '@/lib/schemas'

interface Props {
  section:     FocusSection
  onUpdate:    (updater: (s: FocusSection) => void) => void
  onDelete:    () => void
  collapsed:   boolean
  onToggle:    () => void
  dragHandle?: React.HTMLAttributes<HTMLDivElement>
  isDragging?: boolean
}

export function FocusSectionCard({ section, onUpdate, onDelete, collapsed, onToggle, dragHandle, isDragging }: Props) {
  const [editing,      setEditing]      = useState(false)
  const [titleDraft,   setTitleDraft]   = useState(section.title)
  const [contentDraft, setContentDraft] = useState(section.content)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Edit helpers ──────────────────────────────────────────────────────────

  function startEdit() {
    setTitleDraft(section.title)
    setContentDraft(section.content)
    setEditing(true)
  }

  function commit() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    const title   = titleDraft.trim()   || section.title
    const content = contentDraft
    onUpdate(s => {
      s.title   = title
      s.content = content
    })
    setEditing(false)
  }

  function discard() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    setEditing(false)
  }

  // Debounced blur — gives Save button click time to register before closing
  const onTextareaBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(commit, 200)
  }, [commit])  // eslint-disable-line react-hooks/exhaustive-deps

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); discard() }
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); /* focus textarea */ }
    if (e.key === 'Escape') { e.preventDefault(); discard() }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border bg-card transition-shadow',
        isDragging && 'shadow-lg opacity-80',
        !editing && 'hover:border-border/80',
      )}
    >
      {/* Drag handle */}
      {dragHandle && (
        <div
          {...dragHandle}
          className="absolute left-1 top-3 p-1 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {editing ? (
        /* ── Edit mode ──────────────────────────────────────────────────── */
        <div className="p-3 space-y-2">
          {/* Title */}
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={onTitleKeyDown}
            placeholder="Section title"
            className={cn(
              'w-full bg-transparent text-sm font-semibold text-foreground',
              'border-b border-border/50 pb-1 mb-1',
              'focus:outline-none focus:border-primary',
            )}
          />
          {/* Content textarea — auto-resize via CSS field-sizing */}
          <textarea
            autoFocus
            value={contentDraft}
            onChange={e => setContentDraft(e.target.value)}
            onBlur={onTextareaBlur}
            onKeyDown={onTextareaKeyDown}
            placeholder="Markdown content…"
            className={cn(
              'auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono',
              'focus:outline-none placeholder:text-muted-foreground/40',
              'leading-relaxed',
            )}
          />
          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground/50">
              ⌘↵ save · Esc discard
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={discard} className="h-6 px-2 text-xs">
                Discard
              </Button>
              <Button
                size="sm"
                onMouseDown={e => { e.preventDefault(); commit() }}
                className="h-6 px-2 text-xs"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Display mode ───────────────────────────────────────────────── */
        <div className="pl-6 pr-3 py-3">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              onClick={onToggle}
              className="flex items-center gap-1.5 flex-1 min-w-0 group/collapse"
            >
              {collapsed
                ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                : <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              }
              <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider truncate">
                {section.title}
              </h3>
            </button>
            {/* Actions — visible on hover */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={startEdit}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Edit section"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete section"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Markdown content — hidden when collapsed */}
          {!collapsed && (
            section.content.trim() ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none cursor-text"
                onClick={startEdit}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {section.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p
                className="text-xs text-muted-foreground/40 italic cursor-text"
                onClick={startEdit}
              >
                Empty — click to add content
              </p>
            )
          )}
        </div>
      )}
    </div>
  )
}
