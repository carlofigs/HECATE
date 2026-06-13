/**
 * PeopleTab — searchable people directory with list (expand-in-place) and
 * grid (compact cards) views.
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, LayoutList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Person } from '@/lib/schemas'
import { Prose, SearchInput, SortToggle, toggleDir, type SortDir } from './memoryShared'

type PeopleView = 'list' | 'grid'

function PersonListRow({
  person,
  expanded,
  onToggle,
}: {
  person:   Person
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
      >
        {expanded
          ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
        }
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{person.name}</span>
            <span className="text-[11px] text-muted-foreground/60 truncate leading-snug">{person.role}</span>
          </div>
          {person.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {person.aliases.map(alias => (
                <span
                  key={alias}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/60 font-mono leading-none"
                >
                  {alias}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {expanded && person.notes && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-muted/5">
          <Prose content={person.notes} />
        </div>
      )}
    </div>
  )
}

function PersonGridCard({
  person,
  onClick,
}: {
  person:  Person
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/50 hover:border-border/80 transition-colors w-full"
      title="Click to expand in list view"
    >
      <p className="text-xs font-semibold text-foreground truncate">{person.name}</p>
      <p className="text-[10px] text-muted-foreground/60 leading-snug mt-0.5 line-clamp-2">{person.role}</p>
      {person.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {person.aliases.slice(0, 3).map(alias => (
            <span
              key={alias}
              className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/50 font-mono leading-none"
            >
              {alias}
            </span>
          ))}
          {person.aliases.length > 3 && (
            <span className="text-[9px] text-muted-foreground/35">+{person.aliases.length - 3}</span>
          )}
        </div>
      )}
    </button>
  )
}

export function PeopleTab({ people }: { people: Person[] }) {
  const [search,   setSearch]   = useState('')
  const [view,     setView]     = useState<PeopleView>('list')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const base = q
      ? people.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          p.aliases.some(a => a.toLowerCase().includes(q)) ||
          (p.notes ?? '').toLowerCase().includes(q),
        )
      : people
    return [...base].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [people, search, sortDir])

  // Collapse rows that are no longer visible when search changes
  const filteredNames = useMemo(() => new Set(filtered.map(p => p.name)), [filtered])
  const visibleExpanded = useMemo(
    () => new Set([...expanded].filter(n => filteredNames.has(n))),
    [expanded, filteredNames],
  )

  const toggle = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }, [])

  const handleGridClick = useCallback((name: string) => {
    setView('list')
    setExpanded(prev => new Set([...prev, name]))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-card/30">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${people.length} people…`}
        />

        {/* View toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setView('list')}
            aria-label="List view"
            title="List view"
            className={cn(
              'p-1.5 transition-colors',
              view === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('grid')}
            aria-label="Grid view"
            title="Grid view"
            className={cn(
              'p-1.5 transition-colors',
              view === 'grid'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

        <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />

        {search && (
          <span className="text-[11px] text-muted-foreground/40 shrink-0">
            {filtered.length} of {people.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            No people match "{search}"
          </p>
        ) : view === 'list' ? (
          <div className="space-y-1.5 max-w-2xl mx-auto">
            {filtered.map(p => (
              <PersonListRow
                key={p.name}
                person={p}
                expanded={visibleExpanded.has(p.name)}
                onToggle={() => toggle(p.name)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-4xl mx-auto">
            {filtered.map(p => (
              <PersonGridCard
                key={p.name}
                person={p}
                onClick={() => handleGridClick(p.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
