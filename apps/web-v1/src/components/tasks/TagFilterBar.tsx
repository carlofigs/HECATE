/**
 * TagFilterBar — clickable tag pills that filter visible tasks
 *
 * - Extracts all unique tags from all columns
 * - Multi-select: active tags are highlighted; tasks must match ANY active tag
 * - "Clear" link dismisses all active filters
 * - Hidden when there are no tags across all tasks
 */

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  allTags:  string[]
  active:   Set<string>
  onToggle: (tag: string) => void
  onClear:  () => void
}

export function TagFilterBar({ allTags, active, onToggle, onClear }: Props) {
  if (allTags.length === 0) return null

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border/60 bg-card/20 overflow-x-auto scrollbar-none">
      <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider shrink-0">
        Filter
      </span>

      <div className="flex items-center gap-1 flex-wrap">
        {allTags.map(tag => {
          const isActive = active.has(tag)
          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className={cn(
                'inline-flex items-center h-5 px-2 rounded text-[10px] font-mono transition-colors shrink-0',
                isActive
                  ? 'bg-primary/15 text-primary border border-primary/30 font-medium'
                  : 'bg-muted/40 text-muted-foreground/60 border border-transparent hover:bg-muted/70 hover:text-foreground',
              )}
            >
              #{tag}
            </button>
          )
        })}
      </div>

      {active.size > 0 && (
        <button
          onClick={onClear}
          className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          aria-label="Clear tag filters"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  )
}
