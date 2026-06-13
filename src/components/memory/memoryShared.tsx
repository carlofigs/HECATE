/**
 * Shared primitives for the Memory tabs: sort direction + toggle button,
 * a memoised markdown renderer, and the search input.
 */

import { memo } from 'react'
import { Search, X, ArrowUpAZ, ArrowDownAZ } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

export function toggleDir(d: SortDir): SortDir { return d === 'asc' ? 'desc' : 'asc' }

export function SortToggle({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  const label = dir === 'asc' ? 'A → Z' : 'Z → A'
  return (
    <button
      onClick={onToggle}
      aria-label={`${label} — click to reverse`}
      title={`${label} — click to reverse`}
      className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
    >
      {dir === 'asc'
        ? <ArrowUpAZ   className="w-3.5 h-3.5" />
        : <ArrowDownAZ className="w-3.5 h-3.5" />
      }
    </button>
  )
}

/** Memoised markdown renderer — Memory content rarely changes. */
export const Prose = memo(function Prose({
  content,
  className,
}: {
  content:   string
  className?: string
}) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
})

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value:       string
  onChange:    (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-7 bg-muted/30 rounded pl-7 pr-6 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/40 hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
