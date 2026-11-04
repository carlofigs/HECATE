/**
 * WaitingOnView — structured renderer for the "waiting-on" focus section.
 *
 * Parses a GFM markdown table (| What | Who | Impact |) into a card-based
 * list with inline task ID chips, owner pills, and muted impact text.
 *
 * Falls back to plain prose markdown when the table pattern is not found.
 */

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeTaskIds } from '@/lib/rehypeTaskIds'
import { TaskIdChip } from '@/components/tasks/TaskIdChip'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaitingRow {
  what:   string
  who:    string[]
  impact: string
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseTable(content: string): WaitingRow[] | null {
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean)
  // Need at least: header, separator, 1 data row
  if (lines.length < 3) return null
  // Verify it looks like a pipe table
  if (!lines[0].startsWith('|')) return null

  const rows: WaitingRow[] = []
  for (const line of lines.slice(2)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map(c => c.trim()).filter(Boolean)
    if (cells.length < 3) continue
    const who = cells[1]
      .split(/[/,]/)
      .map(w => w.trim())
      .filter(Boolean)
    rows.push({ what: cells[0], who, impact: cells.slice(2).join(' | ') })
  }
  return rows.length > 0 ? rows : null
}

// ─── Shared inline ReactMarkdown ──────────────────────────────────────────────

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

// ─── Owner chip ───────────────────────────────────────────────────────────────

function OwnerChip({ name }: { name: string }) {
  // Generate a stable hue from the name for subtle colour variation
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border"
      style={{
        borderColor: `hsl(${hue} 40% 50% / 0.3)`,
        background:  `hsl(${hue} 40% 50% / 0.08)`,
        color:       `hsl(${hue} 30% 60%)`,
      }}
    >
      {name}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  content: string
  onEdit:  () => void
}

export function WaitingOnView({ content, onEdit }: Props) {
  const rows = useMemo(() => parseTable(content), [content])

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (!rows) {
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
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 hover:bg-muted/30 transition-colors"
        >
          {/* What — task ID chips render inline */}
          <div className="flex-1 min-w-0 text-xs text-foreground leading-snug">
            <InlineMd>{row.what}</InlineMd>
          </div>

          {/* Who — owner chips */}
          <div className="flex flex-wrap gap-1 shrink-0 pt-[1px]">
            {row.who.map(name => (
              <OwnerChip key={name} name={name} />
            ))}
          </div>

          {/* Impact — muted, task ID chips render inline */}
          <div className="hidden sm:block w-52 shrink-0 text-[11px] text-muted-foreground leading-snug">
            <InlineMd>{row.impact}</InlineMd>
          </div>
        </div>
      ))}

      {/* Impact on mobile — show below when sm breakpoint hides it */}
      {rows.map((row, i) => (
        <p key={`mob-${i}`} className="sm:hidden text-[10px] text-muted-foreground px-1 leading-snug">
          <InlineMd>{row.impact}</InlineMd>
        </p>
      ))}
    </div>
  )
}
