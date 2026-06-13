/**
 * TermsTab — searchable glossary, expand-in-place, auto-expands a single result.
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Term } from '@/lib/schemas'
import { Prose, SearchInput, SortToggle, toggleDir, type SortDir } from './memoryShared'

export function TermsTab({ terms }: { terms: Term[] }) {
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const base = q
      ? terms.filter(t =>
          t.term.toLowerCase().includes(q) ||
          t.meaning.toLowerCase().includes(q),
        )
      : terms
    return [...base].sort((a, b) => {
      const cmp = a.term.localeCompare(b.term)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [terms, search, sortDir])

  const toggle = useCallback((term: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(term) ? next.delete(term) : next.add(term)
      return next
    })
  }, [])

  // Auto-expand when search narrows to a single result
  const autoExpand = filtered.length === 1

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-card/30">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${terms.length} terms…`}
        />
        <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />
        {search && (
          <span className="text-[11px] text-muted-foreground/40 shrink-0">
            {filtered.length} of {terms.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            No terms match "{search}"
          </p>
        ) : (
          <div className="space-y-1.5 max-w-2xl mx-auto">
            {filtered.map(t => {
              const isExpanded = autoExpand || expanded.has(t.term)
              return (
                <div key={t.term} className="rounded-lg border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => toggle(t.term)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown  className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                    }
                    <span className="text-xs font-semibold text-foreground font-mono">
                      {t.term}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-muted/5">
                      <Prose content={t.meaning} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
