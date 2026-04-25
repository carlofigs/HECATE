/**
 * TaskSnapshotRow — read-only task row for Archive and Week Log views
 *
 * Renders an id chip, title, and tags. No click, no drag, no edit.
 * Mirrors the visual weight of TaskListRow but is purely presentational.
 *
 * Props:
 *   showId   — show the ID chip column (default true). When true, null-ID rows
 *              render an empty w-8 placeholder so all titles align.
 *              When false (Week Log context), the title is parsed for a leading
 *              human ID token (e.g. "A65 – BAU validation") and rendered as a
 *              styled pill chip with a rich mini-card tooltip (title, tags, note).
 *   showTags — show tag pills (default true). Pass false in Week Log context.
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'

interface SnapshotLike {
  id:    string | null
  title: string
  tags:  string[]
  note?: string | null
}

interface Props {
  snapshot: SnapshotLike
  accent?:  'green' | 'muted'
  showId?:  boolean
  showTags?: boolean
}

/**
 * Parse a task title for a leading human ID token.
 * Matches: "A65 – title", "B30 title", "A47 – memo"
 */
function parseTitleId(title: string): { chip: string | null; text: string } {
  const m = title.match(/^([A-Z]\d+)\s*(?:[–\-—]\s*)?(.+)$/)
  if (m && m[2].trim()) return { chip: m[1], text: m[2].trim() }
  return { chip: null, text: title }
}

// ─── Mini snapshot card shown inside the tooltip ──────────────────────────────

function SnapshotPreview({ snapshot }: { snapshot: SnapshotLike }) {
  return (
    <div>
      {/* Title */}
      <div className="px-3 py-2.5 border-b border-border bg-muted/20">
        <p className="text-xs font-medium text-foreground leading-snug">
          {snapshot.title}
        </p>
      </div>

      {/* Tags + note */}
      <div className="px-3 pt-2 pb-2.5 space-y-1.5">
        {snapshot.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {snapshot.tags.map(tag => (
              <span
                key={tag}
                className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        {snapshot.note && (
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
            {snapshot.note}
          </p>
        )}
        {!snapshot.tags.length && !snapshot.note && (
          <p className="text-[10px] text-muted-foreground/40 italic">No tags or notes</p>
        )}
      </div>
    </div>
  )
}

export function TaskSnapshotRow({
  snapshot,
  accent   = 'muted',
  showId   = true,
  showTags = true,
}: Props) {
  const { chip: titleChip, text: titleText } = showId
    ? { chip: null, text: snapshot.title }
    : parseTitleId(snapshot.title)

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-1.5 text-xs border-l-2',
      accent === 'green' ? 'border-l-green-500/40' : 'border-l-border',
    )}>

      {/* Structured ID chip (archive) — w-8 reserved for alignment */}
      {showId && (
        <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
          {snapshot.id ? displayId(snapshot.id) : ''}
        </span>
      )}

      {/* Human ID chip with rich mini-card tooltip (week log) */}
      {titleChip && (
        <TooltipPrimitive.Root delayDuration={250}>
          <TooltipPrimitive.Trigger asChild>
            <span className={cn(
              'inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 tabular-nums',
              'border transition-colors cursor-default',
              'border-primary/30 bg-primary/10 text-primary/80',
              'hover:bg-primary/20 hover:border-primary/50',
            )}>
              {titleChip}
            </span>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              sideOffset={6}
              collisionPadding={12}
              className={cn(
                'z-50 w-56 rounded-lg border border-border bg-card shadow-xl p-0 overflow-hidden',
                'animate-in fade-in-0 zoom-in-95',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
              )}
            >
              <SnapshotPreview snapshot={snapshot} />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      )}

      {/* Title */}
      <span className="flex-1 min-w-0 text-foreground truncate">
        {titleText}
      </span>

      {/* Tags */}
      {showTags && snapshot.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {snapshot.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
            >
              #{tag}
            </span>
          ))}
          {snapshot.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground/60">
              +{snapshot.tags.length - 3}
            </span>
          )}
        </div>
      )}

    </div>
  )
}
