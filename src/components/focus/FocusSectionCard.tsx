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

import { useCallback } from 'react'
import { useInlineEdit } from '@/hooks/useInlineEdit'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeTaskIds } from '@/lib/rehypeTaskIds'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'
import { WeekCalendarView } from '@/components/focus/WeekCalendarView'
import { ThisWeekView } from '@/components/focus/ThisWeekView'
import { WaitingOnView } from '@/components/focus/WaitingOnView'
import { KeepInMindView } from '@/components/focus/KeepInMindView'
import { Pencil, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, paletteToken, accentHeaderStyle, accentTextStyle } from '@/lib/utils'
import type { FocusSection, CalendarEvent } from '@/lib/schemas'

interface Props {
  section:         FocusSection
  colorIndex:      number
  weekOf:          string
  calendarEvents?: CalendarEvent[]
  onUpdate:        (updater: (s: FocusSection) => void) => void
  onDelete:        () => void
  collapsed:       boolean
  onToggle:        () => void
  dragHandle?:     React.HTMLAttributes<HTMLDivElement>
  isDragging?:     boolean
}

export function FocusSectionCard({ section, colorIndex, weekOf, calendarEvents, onUpdate, onDelete, collapsed, onToggle, dragHandle, isDragging }: Props) {
  const token = paletteToken(colorIndex)

  // ── Inline edit ───────────────────────────────────────────────────────────

  const {
    editing,
    draft,
    setDraft,
    startEdit,
    commit,
    discard,
    onTextareaBlur,
    onTextareaKeyDown,
    onTitleKeyDown,
  } = useInlineEdit(
    { title: section.title, content: section.content },
    useCallback(
      ({ title, content }: { title: string; content: string }) => {
        onUpdate(s => {
          s.title   = title.trim() || section.title
          s.content = content
        })
      },
      [onUpdate, section.title],
    ),
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border bg-card transition-shadow',
        isDragging && 'shadow-lg opacity-80',
        !editing && 'hover:border-border/80',
      )}
    >
      {/* Drag handle — positioned inside header area */}
      {dragHandle && (
        <div
          {...dragHandle}
          className="absolute left-1.5 top-2 p-1 cursor-grab opacity-30 hover:opacity-70 transition-opacity touch-none z-10"
          style={accentTextStyle(token)}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {editing ? (
        /* ── Edit mode ──────────────────────────────────────────────────── */
        <div className="p-3 space-y-2">
          {/* Title */}
          <input
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
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
            value={draft.content}
            onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
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
        <div>
          {/* Coloured header */}
          <div
            className={cn(
              'flex items-center justify-between gap-2 pl-8 pr-3 py-2 border',
              collapsed ? 'rounded-lg' : 'rounded-t-lg border-b-0',
            )}
            style={accentHeaderStyle(token)}
          >
            <button
              onClick={onToggle}
              className="flex items-center gap-1.5 flex-1 min-w-0"
            >
              {collapsed
                ? <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" style={accentTextStyle(token)} />
                : <ChevronDown  className="w-3.5 h-3.5 shrink-0 opacity-70" style={accentTextStyle(token)} />
              }
              <h3
                className="text-xs font-semibold uppercase tracking-wider truncate"
                style={accentTextStyle(token)}
              >
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

          {/* Content body — hidden when collapsed */}
          {!collapsed && (
            <div className="px-3 py-3 rounded-b-lg border border-t-0 border-border bg-card/50">
              {section.content.trim() ? (
                section.id === 'week-at-a-glance' ? (
                  <WeekCalendarView content={section.content} weekOf={weekOf} calendarEvents={calendarEvents} onEdit={startEdit} />
                ) : section.id === 'this-week' ? (
                  <ThisWeekView content={section.content} onEdit={startEdit} />
                ) : section.id === 'waiting-on' ? (
                  <WaitingOnView content={section.content} onEdit={startEdit} />
                ) : section.id === 'keep-in-mind' ? (
                  <KeepInMindView content={section.content} onEdit={startEdit} />
                ) : (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none cursor-text"
                  onClick={startEdit}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeTaskIds]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    components={{ 'task-id-chip': ({ node, ...props }: any) => <TaskIdChip taskid={String(props.taskid ?? '')} /> } as any}
                  >
                    {section.content}
                  </ReactMarkdown>
                </div>
                )
              ) : (
                <p
                  className="text-xs text-muted-foreground/40 italic cursor-text"
                  onClick={startEdit}
                >
                  Empty — click to add content
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
