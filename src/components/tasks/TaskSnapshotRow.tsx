/**
 * TaskSnapshotRow — read-only task row for Archive and Week Log views
 *
 * Archive context (showId=true):  structured ID chip + title + tags
 * Week Log context (showId=false): parsed human ID chip (clickable, toggles
 *   an expanded detail panel) + title. One row can be open at a time —
 *   the parent (TaskSnapshotSection) tracks the single expandedKey.
 */

import { cn } from '@/lib/utils'
import { displayId } from '@/lib/taskConstants'

interface SnapshotLike {
  id:    string | null
  title: string
  tags:  string[]
  note?: string | null
}

interface Props {
  snapshot:  SnapshotLike
  accent?:   'green' | 'muted'
  showId?:   boolean
  showTags?: boolean
  /** Week Log only: whether this row's detail panel is open */
  expanded?:  boolean
  /** Week Log only: called when the chip is clicked */
  onToggle?: () => void
}

/**
 * Parse a leading human ID token from a task title.
 * Matches: "A65 – BAU validation", "B30 response", "A47 – memo"
 */
export function parseTitleId(title: string): { chip: string | null; text: string } {
  const m = title.match(/^([A-Z]\d+)\s*(?:[–\-—]\s*)?(.+)$/)
  if (m && m[2].trim()) return { chip: m[1], text: m[2].trim() }
  return { chip: null, text: title }
}

export function TaskSnapshotRow({
  snapshot,
  accent    = 'muted',
  showId    = true,
  showTags  = true,
  expanded  = false,
  onToggle,
}: Props) {
  const { chip: titleChip, text: titleText } = showId
    ? { chip: null, text: snapshot.title }
    : parseTitleId(snapshot.title)

  const hasDetail = snapshot.tags.length > 0 || !!snapshot.note

  return (
    <div className={cn(
      'border-l-2 text-xs',
      accent === 'green' ? 'border-l-green-500/40' : 'border-l-border',
    )}>

      {/* ── Main row ── */}
      <div className="flex items-center gap-2.5 px-3 py-1.5">

        {/* Structured ID chip (archive) — reserves w-8 for alignment */}
        {showId && (
          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 tabular-nums w-8">
            {snapshot.id ? displayId(snapshot.id) : ''}
          </span>
        )}

        {/* Human ID chip — clickable toggle (week log) */}
        {titleChip && (
          <button
            onClick={onToggle}
            disabled={!hasDetail && !expanded}
            className={cn(
              'inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 tabular-nums',
              'border transition-colors',
              hasDetail || expanded
                ? 'cursor-pointer'
                : 'cursor-default',
              expanded
                ? 'border-primary/50 bg-primary/20 text-primary'
                : 'border-primary/30 bg-primary/10 text-primary/80 hover:bg-primary/20 hover:border-primary/50',
            )}
          >
            {titleChip}
          </button>
        )}

        {/* Title */}
        <span className="flex-1 min-w-0 text-foreground truncate">
          {titleText}
        </span>

        {/* Tags (archive context) */}
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

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-border/20 bg-muted/10 pt-2">
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
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {snapshot.note}
            </p>
          )}
          {!hasDetail && (
            <p className="text-[10px] text-muted-foreground/40 italic">No tags or notes</p>
          )}
        </div>
      )}

    </div>
  )
}
