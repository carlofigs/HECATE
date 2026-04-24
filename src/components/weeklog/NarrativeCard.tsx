/**
 * NarrativeCard — editable markdown section for Week Log narrative fields
 *
 * Display: rendered GFM markdown, click-anywhere to edit
 * Edit:    auto-resize textarea via useInlineEdit<string>
 *
 * The label (section title) is fixed — only the markdown content is editable.
 */

import { Pencil } from 'lucide-react'
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
}

export function NarrativeCard({ label, content, onUpdate, minEditHeight = 120 }: Props) {
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

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
            title={`Edit ${label}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── Body ── */}
      {editing ? (
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
          onClick={startEdit}
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
      )}
    </div>
  )
}
