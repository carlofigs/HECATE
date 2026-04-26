/**
 * MeetingsCard — collapsible accordion for Meetings & Discussions
 *
 * Content format: markdown with ## headings as meeting titles
 *
 *   ## Standup
 *   - Discussed sprint progress
 *
 *   ## Sprint Review
 *   Went well overall.
 *
 * Display:
 *   Outer collapse toggle (same pattern as NarrativeCard)
 *   When expanded: each ## heading becomes a sub-row; click to toggle body.
 *   One sub-row open at a time (accordion).
 *   Fallback: if no ## headings, renders body as plain text (click-to-edit).
 *
 * Edit: raw textarea with format hint; ⌘↵ / Esc / blur-commit.
 */

import { useState } from 'react'
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useInlineEdit } from '@/hooks/useInlineEdit'
import { cn } from '@/lib/utils'

// ─── Parser ──────────────────────────────────────────────────────────────────

interface Meeting {
  title: string
  body:  string
}

function parseMeetings(content: string): Meeting[] {
  const lines   = content.split('\n')
  const entries: Meeting[] = []
  let   current: Meeting | null = null

  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      if (current) entries.push(current)
      current = { title: m[1].trim(), body: '' }
    } else if (current) {
      current.body = current.body ? current.body + '\n' + line : line
    }
  }
  if (current) entries.push(current)
  return entries.map(e => ({ ...e, body: e.body.trim() }))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  content:  string
  onUpdate: (content: string) => void
}

export function MeetingsCard({ content, onUpdate }: Props) {
  const [collapsed,   setCollapsed]   = useState(true)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

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

  function handleStartEdit() {
    if (collapsed) setCollapsed(false)
    startEdit()
  }

  const meetings    = parseMeetings(content)
  const hasHeadings = meetings.length > 0

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">

      {/* ── Header ── */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 bg-muted/10',
        !collapsed && 'border-b border-border/40',
      )}>
        <div
          className={cn(
            'flex items-center gap-1.5 flex-1 min-w-0',
            !editing && 'cursor-pointer',
          )}
          onClick={!editing ? () => { setCollapsed(c => !c); setExpandedIdx(null) } : undefined}
        >
          {!editing && (
            <ChevronDown className={cn(
              'w-3 h-3 text-violet-400/70 transition-transform duration-150 shrink-0',
              collapsed && '-rotate-90',
            )} />
          )}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/70 truncate">
            Meetings &amp; Discussions
          </h3>
        </div>

        {!editing && !collapsed && (
          <button
            onClick={handleStartEdit}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title="Edit Meetings & Discussions"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        editing ? (
          /* Edit mode */
          <div className="p-3 space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={onTextareaBlur}
              onKeyDown={onTextareaKeyDown}
              placeholder={'## Meeting title\nNotes about this meeting…\n\n## Another meeting\nMore notes…'}
              className={cn(
                'auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono',
                'focus:outline-none placeholder:text-muted-foreground/40 leading-relaxed min-h-[160px]',
              )}
            />
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground/40">
                Use ## headings for each meeting · ⌘↵ save · Esc discard
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
        ) : !content.trim() ? (
          /* Empty state */
          <div
            className="px-3 py-3 cursor-text min-h-[48px]"
            onClick={handleStartEdit}
            title="Click to edit"
          >
            <p className="text-xs text-muted-foreground/30 italic">
              Empty — click to add meetings
            </p>
          </div>
        ) : hasHeadings ? (
          /* Accordion per meeting */
          <div className="divide-y divide-border/20">
            {meetings.map((meeting, idx) => (
              <div key={idx} className="border-l-2 border-l-violet-400/20">
                {/* Meeting row header */}
                <button
                  onClick={() => setExpandedIdx(i => i === idx ? null : idx)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
                >
                  {expandedIdx === idx
                    ? <ChevronDown  className="w-3 h-3 text-violet-400/60 shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-violet-400/40 shrink-0" />
                  }
                  <span className="text-xs font-medium text-foreground truncate">
                    {meeting.title}
                  </span>
                </button>

                {/* Meeting body */}
                {expandedIdx === idx && (
                  <div className="px-3 pb-3 pt-1.5 bg-muted/10 border-t border-border/20">
                    {meeting.body ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{meeting.body}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40 italic">No notes</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Fallback: no ## headings — plain clickable content */
          <div
            className="px-3 py-3 cursor-text"
            onClick={handleStartEdit}
            title="Click to edit"
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )
      )}
    </div>
  )
}
