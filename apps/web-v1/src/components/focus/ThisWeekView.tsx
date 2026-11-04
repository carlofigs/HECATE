/**
 * ThisWeekView — structured renderer for the "this-week" focus section.
 *
 * Parses the markdown content into two visual zones:
 *  1. Sprint context card  — blockquote lines (> ...) rendered as a
 *     sky-tinted card with a coloured left border.
 *  2. Priority list        — numbered items with emoji → coloured dot,
 *     tag chips, and task ID chips via rehypeTaskIds.
 *
 * Falls back to plain prose ReactMarkdown when the pattern is not found.
 */

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeTaskIds } from '@/lib/rehypeTaskIds'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PriorityItem {
  num:      number
  priority: 'critical' | 'high' | 'normal'
  content:  string
  tags:     string[]
}

interface Parsed {
  contextLines: string[]
  items:        PriorityItem[]
}

// ─── Priority styling ─────────────────────────────────────────────────────────

const PRIORITY_CFG = {
  critical: {
    dot:   'bg-red-500',
    badge: 'border border-red-500/20 bg-red-500/10 text-red-400',
    row:   'border-l-2 border-red-500/30 bg-red-500/[0.03]',
  },
  high: {
    dot:   'bg-amber-400',
    badge: 'border border-amber-400/20 bg-amber-400/10 text-amber-400',
    row:   'border-l-2 border-amber-400/30 bg-amber-400/[0.03]',
  },
  normal: {
    dot:   'bg-muted-foreground/30',
    badge: 'border border-border bg-muted text-muted-foreground',
    row:   'border-l-2 border-border/50',
  },
} as const

// ─── Parser ───────────────────────────────────────────────────────────────────

function parse(raw: string): Parsed | null {
  const lines        = raw.split('\n')
  const contextLines: string[] = []
  const items:        PriorityItem[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Blockquote lines → sprint context
    if (trimmed.startsWith('> ')) {
      contextLines.push(trimmed.slice(2))
      continue
    }

    // Numbered list items: `1. [🔴|🟡|🟢|⚪] content ... #tags`
    const m = trimmed.match(/^(\d+)\.\s*(🔴|🟡|🟢|⚪)?\s*(.+)$/)
    if (!m) continue

    const num   = parseInt(m[1], 10)
    const emoji = m[2] ?? ''
    let content = m[3].trim()

    // Extract all #tag tokens (they appear inline, usually at end)
    const tags: string[] = []
    content = content.replace(/#(\w+)/g, (_, tag: string) => {
      tags.push(tag)
      return ''
    }).trim()
    // Clean up any trailing punctuation / em-dash left after tag removal
    content = content.replace(/[\s—–-]+$/, '').trim()

    const priority: PriorityItem['priority'] =
      emoji === '🔴' ? 'critical' :
      emoji === '🟡' ? 'high'     : 'normal'

    items.push({ num, priority, content, tags })
  }

  if (items.length === 0) return null
  return { contextLines, items }
}

// ─── Shared inline ReactMarkdown config ──────────────────────────────────────

// Renders markdown inline (strips wrapping <p> → <span>) so it works inside
// flex rows without breaking layout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inlineComponents: any = {
  p:              ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  'task-id-chip': ({ node: _node, ...props }: { node: unknown; taskid?: unknown }) =>
                  <TaskIdChip taskid={String(props.taskid ?? '')} />,
}

function InlineMd({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeTaskIds]}
      components={inlineComponents}
    >
      {children}
    </ReactMarkdown>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  content: string
  onEdit:  () => void
}

export function ThisWeekView({ content, onEdit }: Props) {
  const parsed = useMemo(() => parse(content), [content])

  // ── Fallback: unrecognised format → plain prose ───────────────────────────
  if (!parsed) {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none cursor-text"
        onClick={onEdit}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeTaskIds]}
          components={{
            'task-id-chip': ({ node: _node, ...props }: { node: unknown; taskid?: unknown }) =>
              <TaskIdChip taskid={String(props.taskid ?? '')} />,
          } as React.ComponentProps<typeof ReactMarkdown>['components']}
        >
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  const { contextLines, items } = parsed

  return (
    <div className="space-y-3">

      {/* ── Sprint context card ───────────────────────────────────────────── */}
      {contextLines.length > 0 && (
        <div className="rounded-md border-l-[3px] border-sky-500/50 bg-sky-500/[0.04] px-3 py-2 space-y-1">
          {contextLines.map((line, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-snug">
              <InlineMd>{line}</InlineMd>
            </p>
          ))}
        </div>
      )}

      {/* ── Priority items ────────────────────────────────────────────────── */}
      <ol className="space-y-1.5 list-none m-0 p-0">
        {items.map(item => {
          const cfg = PRIORITY_CFG[item.priority]
          return (
            <li key={item.num} className={cn('flex items-start gap-2.5 rounded-md pl-2.5 pr-2 py-2', cfg.row)}>

              {/* Position number */}
              <span className="shrink-0 w-4 text-right text-[10px] font-mono text-muted-foreground/50 mt-[3px]">
                {item.num}
              </span>

              {/* Priority dot */}
              <span className={cn('mt-[5px] w-2 h-2 rounded-full shrink-0', cfg.dot)} />

              {/* Content + tags */}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-foreground leading-snug">
                  <InlineMd>{item.content}</InlineMd>
                </span>

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.tags.map(tag => (
                      <span
                        key={tag}
                        className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cfg.badge)}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
