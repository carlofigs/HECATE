/**
 * KeepInMindView — structured renderer for the "keep-in-mind" focus section.
 *
 * Parses bullet list items and categorises them by signal words:
 *   ⚠️ emoji or "warning"     → orange left accent
 *   contract / last day        → rose left accent
 *   OOO / leave / ends / date  → amber left accent
 *   all others                 → neutral border
 *
 * Each item is rendered via ReactMarkdown so bold, task ID chips, and
 * inline code all work correctly.
 *
 * Falls back to plain prose when bullet list pattern is not detected.
 */

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeTaskIds } from '@/lib/rehypeTaskIds'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Accent = 'warning' | 'deadline' | 'date' | 'normal'

interface KimItem {
  content: string
  accent:  Accent
}

// ─── Accent detection ─────────────────────────────────────────────────────────

const WARNING_RE  = /⚠|warning/i
const DEADLINE_RE = /contract end|last day|must be|before .*(Mon|Tue|Wed|Thu|Fri)/i
const DATE_RE     = /OOO|on leave|leaves \d|Ced .*(OOO|leave)|Janvi|until ~?Mon|until ~?Tue|until ~?Wed|until ~?Thu|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i

function classifyAccent(text: string): Accent {
  if (WARNING_RE.test(text))  return 'warning'
  if (DEADLINE_RE.test(text)) return 'deadline'
  if (DATE_RE.test(text))     return 'date'
  return 'normal'
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseItems(content: string): KimItem[] | null {
  const lines   = content.split('\n')
  const items: KimItem[] = []
  let current   = ''

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) {
      items.push({ content: trimmed, accent: classifyAccent(trimmed) })
    }
    current = ''
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flush()
      current = trimmed.slice(2)
    } else if (trimmed && current) {
      // Continuation line (indented sub-content)
      current += ' ' + trimmed
    }
  }
  flush()

  return items.length > 0 ? items : null
}

// ─── Accent style map ─────────────────────────────────────────────────────────

const ACCENT_CFG: Record<Accent, { border: string; dot: string }> = {
  warning:  { border: 'border-l-2 border-orange-400/60 bg-orange-400/[0.04]', dot: 'bg-orange-400' },
  deadline: { border: 'border-l-2 border-rose-500/50 bg-rose-500/[0.03]',    dot: 'bg-rose-500'   },
  date:     { border: 'border-l-2 border-amber-400/40 bg-amber-400/[0.03]',  dot: 'bg-amber-400'  },
  normal:   { border: 'border-l-2 border-border/50',                          dot: 'bg-muted-foreground/30' },
}

// ─── Inline ReactMarkdown ─────────────────────────────────────────────────────

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

export function KeepInMindView({ content, onEdit }: Props) {
  const items = useMemo(() => parseItems(content), [content])

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (!items) {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none cursor-text"
        onClick={onEdit}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    )
  }

  return (
    <ul className="space-y-1.5 list-none m-0 p-0">
      {items.map((item, i) => {
        const cfg = ACCENT_CFG[item.accent]
        return (
          <li key={i} className={cn('flex items-start gap-2.5 rounded-r-md pl-2.5 pr-2 py-1.5', cfg.border)}>
            <span className={cn('mt-[5px] w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
            <span className="text-xs text-foreground leading-relaxed">
              <InlineMd>{item.content}</InlineMd>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
