/**
 * NarrativeCard — editable markdown section for Week Log narrative fields
 *
 * Display: rendered GFM markdown, click body to edit
 * Edit:    auto-resize textarea via useInlineEdit<string>
 * Collapse: when collapsible=true the header acts as a toggle (starts collapsed)
 */

import { useState } from 'react'
import { Pencil, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useInlineEdit } from '@/hooks/useInlineEdit'
import { cn } from '@/lib/utils'

interface Props {
  label:    string
  content:  string
  onUpdate: (content: string) => void
  /** Optional min height for the edit textarea. Defaults to 120px */
  minEditHeight?: number
  /** When true the header is a collapse toggle; starts collapsed. */
  collapsible?: boolean
  /**
   * Tailwind bg-colour class applied to the header background.
   * Replaces the default bg-muted/20 when provided.
   * e.g. 'bg-violet-400/15', 'bg-sky-500/15'
   */
  accent?: string
}

export function NarrativeCard({
  label,
  content,
  onUpdate,
  minEditHeight = 120,
  collapsible   = false,
  accent,
}: Props) {
  const [collapsed, setCollapsed] = useState(collapsible)

  const {
    editing,
    draft,
    setDraft,
    startEdit,
    commit,
    discard,
    onTextareaBlur,
    onTextareaKeyDown,
  } = useInlineEdit(content, onUpdate)

  // Expand automatically when edit is triggered from outside
  function handleStartEdit() {
    if (collapsed) setCollapsed(false)
    startEdit()
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2',
        accent ?? 'bg-muted/20',
        !collapsed && 'border-b border-border/40',
      )}>

        {/* Left: chevron (collapsible) + label */}
        <div
          className={cn(
            'flex items-center gap-1.5 flex-1 min-w-0',
            collapsible && !editing && 'cursor-pointer',
          )}
          onClick={collapsible && !editing ? () => setCollapsed(c => !c) : undefined}
        >
          {collapsible && !editing && (
            <ChevronDown className={cn(
              'w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0',
              collapsed && '-rotate-90',
            )} />
          )}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </h3>
        </div>

        {/* Right: pencil (only when expanded and not editing) */}
        {!editing && !collapsed && (
          <button
            onClick={handleStartEdit}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title={`Edit ${label}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── Body (hidden when collapsed) ── */}
      {!collapsed && (
        editing ? (
          <div className="p-3 space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={onTextareaBlur}
              onKeyDown={onTextareaKeyDown}
              placeholder="Markdown content…"
              className={cn(
                'auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono',
                'focus:outline-none placeholder:text-muted-foreground/40 leading-relaxed',
              )}
              style={{ minHeight: `${minEditHeight}px` }}
            />
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground/40">⌘↵ save · Esc discard</span>
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
          <div
            className="px-3 py-3 cursor-text min-h-[48px]"
            onClick={handleStartEdit}
            title="Click to edit"
          >
            {content.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 italic">
                Empty — click to add content
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}
