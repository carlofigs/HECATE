/**
 * MemoryPage — read-only view of memory.json
 *
 * Tabs: Me · People · Terms · Projects · Recurring · Preferences · References
 *
 * People:     searchable list (expand-in-place) + grid (compact cards)
 * Terms:      searchable, expand-in-place
 * Projects:   left panel list + right markdown render
 * References: left file tree (grouped by dir) + right markdown render
 *
 * All tabs are read-only — Memory is managed by the memory-pipeline skill,
 * not edited inline in HECATE.
 */

import { useState, useMemo, useCallback, memo } from 'react'
import {
  Search, X, ChevronDown, ChevronRight,
  LayoutList, LayoutGrid, FileText,
  ArrowUpAZ, ArrowDownAZ,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useDataFile } from '@/hooks/useDataFile'
import { PageShell } from '@/components/layout/PageShell'
import { cn } from '@/lib/utils'
import type { Person, Term, ProjectSummary, Responsibility } from '@/lib/schemas'

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId =
  | 'me'
  | 'people'
  | 'terms'
  | 'projects'
  | 'recurring'
  | 'preferences'
  | 'references'

type PeopleView    = 'list' | 'grid'
type SortDir       = 'asc'  | 'desc'
type RecurringSortBy = 'name' | 'cadence'

const VALID_TABS = new Set<TabId>([
  'me', 'people', 'terms', 'projects', 'recurring', 'preferences', 'references',
])

const TABS: { id: TabId; label: string }[] = [
  { id: 'me',          label: 'Me'          },
  { id: 'people',      label: 'People'      },
  { id: 'terms',       label: 'Terms'       },
  { id: 'projects',    label: 'Projects'    },
  { id: 'recurring',   label: 'Recurring'   },
  { id: 'preferences', label: 'Preferences' },
  { id: 'references',  label: 'References'  },
]

const TAB_KEY = 'hecate:memory:tab'

function readStoredTab(): TabId {
  const raw = localStorage.getItem(TAB_KEY)
  return raw && VALID_TABS.has(raw as TabId) ? (raw as TabId) : 'me'
}

// ─── Shared: sort toggle ──────────────────────────────────────────────────────

function SortToggle({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
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

function toggleDir(d: SortDir): SortDir { return d === 'asc' ? 'desc' : 'asc' }

// ─── Shared: markdown renderer (memoised — content rarely changes) ────────────

const Prose = memo(function Prose({
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

// ─── Shared: search input ─────────────────────────────────────────────────────

function SearchInput({
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

// ─── Me tab ───────────────────────────────────────────────────────────────────

function MeTab({ content }: { content: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <Prose content={content} />
      </div>
    </div>
  )
}

// ─── People tab ───────────────────────────────────────────────────────────────

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

function PeopleTab({ people }: { people: Person[] }) {
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

// ─── Terms tab ────────────────────────────────────────────────────────────────

function TermsTab({ terms }: { terms: Term[] }) {
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

// ─── Projects tab ─────────────────────────────────────────────────────────────

function ProjectsTab({ projects }: { projects: ProjectSummary[] }) {
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() =>
    [...projects].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return sortDir === 'asc' ? cmp : -cmp
    }),
  [projects, sortDir])

  const [selected, setSelected] = useState<string>(sorted[0]?.name ?? '')
  const current = projects.find(p => p.name === selected)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: project list ── */}
      <div className="w-44 shrink-0 border-r border-border flex flex-col bg-card/30">
        <div className="shrink-0 flex items-center justify-end px-2 py-1.5 border-b border-border/50">
          <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sorted.map(p => (
            <button
              key={p.name}
              onClick={() => setSelected(p.name)}
              className={cn(
                'w-full flex items-start gap-1.5 px-3 py-1.5 text-left transition-colors text-[11px] leading-snug',
                selected === p.name
                  ? 'bg-primary/8 text-primary border-r-2 border-r-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
              )}
            >
              <FileText className="w-3 h-3 shrink-0 opacity-50 mt-px" />
              <span className="break-words min-w-0">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: rendered summary ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {current ? (
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-foreground mb-3">{current.name}</p>
            <Prose content={current.summary} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            Select a project from the list
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Recurring tab ────────────────────────────────────────────────────────────

const CADENCE_COLOUR: Record<string, string> = {
  Weekly:      'text-primary bg-primary/10 border-primary/20',
  Monthly:     'text-violet-500 bg-violet-500/10 border-violet-500/20',
  'As needed': 'text-muted-foreground bg-muted/40 border-border',
}

const CADENCE_ORDER: Record<string, number> = {
  Weekly: 0, Monthly: 1, 'As needed': 2,
}

function RecurringTab({ responsibilities }: { responsibilities: Responsibility[] }) {
  const [sortBy,  setSortBy]  = useState<RecurringSortBy>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sorted = useMemo(() =>
    [...responsibilities].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        const ao = CADENCE_ORDER[a.cadence] ?? 99
        const bo = CADENCE_ORDER[b.cadence] ?? 99
        cmp = ao !== bo ? ao - bo : a.name.localeCompare(b.name)
      }
      return sortDir === 'asc' ? cmp : -cmp
    }),
  [responsibilities, sortBy, sortDir])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-card/30">
        <span className="text-[11px] text-muted-foreground/50 shrink-0">Sort by</span>
        <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
          {(['name', 'cadence'] as RecurringSortBy[]).map(opt => (
            <button
              key={opt}
              onClick={() => setSortBy(opt)}
              className={cn(
                'px-2.5 py-1 text-[11px] capitalize transition-colors',
                sortBy === opt
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        <SortToggle dir={sortDir} onToggle={() => setSortDir(toggleDir)} />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-3 max-w-2xl mx-auto px-4 py-4">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground/40 italic text-center py-8">
              No recurring responsibilities logged
            </p>
          ) : sorted.map(r => (
            <div key={r.name} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-foreground flex-1 min-w-0">{r.name}</p>
                <span
                  className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0',
                    CADENCE_COLOUR[r.cadence] ?? 'text-muted-foreground bg-muted/40 border-border',
                  )}
                >
                  {r.cadence}
                </span>
              </div>
              {r.notes && <Prose content={r.notes} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Preferences tab ──────────────────────────────────────────────────────────

function PreferencesTab({
  preferences,
  productivitySystem,
}: {
  preferences:        string
  productivitySystem: string
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
            Working Preferences
          </h2>
          <div className="rounded-lg border border-border bg-card p-3">
            <Prose content={preferences} />
          </div>
        </section>
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
            Productivity System
          </h2>
          <div className="rounded-lg border border-border bg-card p-3">
            <Prose content={productivitySystem} />
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── References tab ───────────────────────────────────────────────────────────

/** Group reference file keys by top-level directory prefix */
function groupRefFiles(files: Record<string, string>): { dir: string; files: string[] }[] {
  const groups: Record<string, string[]> = { '': [] }
  for (const key of Object.keys(files).sort()) {
    const slash = key.indexOf('/')
    if (slash === -1) {
      groups[''].push(key)
    } else {
      const dir = key.slice(0, slash)
      ;(groups[dir] ??= []).push(key)
    }
  }
  return Object.entries(groups)
    .filter(([, f]) => f.length > 0)
    .map(([dir, f]) => ({ dir, files: f }))
    .sort((a, b) => {
      if (a.dir === '') return -1
      if (b.dir === '') return 1
      return a.dir.localeCompare(b.dir)
    })
}

function fileLabel(path: string): string {
  const slash = path.lastIndexOf('/')
  const base  = slash === -1 ? path : path.slice(slash + 1)
  return base.replace(/\.md$/, '')
}

function ReferencesTab({ files }: { files: Record<string, string> }) {
  const groups = useMemo(() => groupRefFiles(files), [files])

  // Stable initial selection: first file in the sorted tree
  const firstFile = useMemo(
    () => groups[0]?.files[0] ?? '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally only on mount
  )
  const [selected, setSelected] = useState<string>(firstFile)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: file tree ── */}
      <div className="w-44 shrink-0 border-r border-border overflow-y-auto py-2 bg-card/30">
        {groups.map(({ dir, files: dirFiles }) => (
          <div key={dir || '__root'} className="mb-1">
            {dir && (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/35 select-none">
                {dir}/
              </p>
            )}
            {dirFiles.map(path => (
              <button
                key={path}
                onClick={() => setSelected(path)}
                className={cn(
                  'w-full flex items-start gap-1.5 px-3 py-1.5 text-left transition-colors text-[11px] leading-snug',
                  selected === path
                    ? 'bg-primary/8 text-primary border-r-2 border-r-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <FileText className="w-3 h-3 shrink-0 opacity-50 mt-px" />
                <span className="break-words min-w-0">{fileLabel(path)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Right: rendered content ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {selected && files[selected] ? (
          <>
            <p className="text-[10px] font-mono text-muted-foreground/25 mb-3 select-all">
              {selected}
            </p>
            <div className="max-w-2xl">
              <Prose content={files[selected]} />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic py-8 text-center">
            Select a file from the tree
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const { data, loading, error, reload } = useDataFile('memory')

  const [activeTab, setActiveTab] = useState<TabId>(readStoredTab)

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id)
    localStorage.setItem(TAB_KEY, id)
  }, [])

  // Count badges derived from loaded data
  const counts: Partial<Record<TabId, number>> = data
    ? {
        people:     data.people.length,
        terms:      data.terms.length,
        projects:   data.projects.length,
        recurring:  data.recurringResponsibilities.length,
        references: Object.keys(data.referenceFiles).length,
      }
    : {}

  const skeleton = (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-2 w-64">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    </div>
  )

  return (
    <PageShell loading={loading} error={error} onRetry={reload} skeleton={skeleton}>
      {data && (
        <div className="flex flex-col h-full overflow-hidden bg-background">

          {/* ── Tab bar ── */}
          <div className="shrink-0 flex items-end border-b border-border bg-card overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium',
                  'border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-b-primary text-primary'
                    : 'border-b-transparent text-muted-foreground hover:text-foreground hover:border-b-border/60',
                )}
              >
                {tab.label}
                {counts[tab.id] !== undefined && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full tabular-nums leading-none',
                      activeTab === tab.id
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted/60 text-muted-foreground/50',
                    )}
                  >
                    {counts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'me'          && <MeTab content={data.me} />}
            {activeTab === 'people'      && <PeopleTab people={data.people} />}
            {activeTab === 'terms'       && <TermsTab terms={data.terms} />}
            {activeTab === 'projects'    && <ProjectsTab projects={data.projects} />}
            {activeTab === 'recurring'   && <RecurringTab responsibilities={data.recurringResponsibilities} />}
            {activeTab === 'preferences' && (
              <PreferencesTab
                preferences={data.preferences}
                productivitySystem={data.productivitySystem}
              />
            )}
            {activeTab === 'references'  && <ReferencesTab files={data.referenceFiles} />}
          </div>
        </div>
      )}
    </PageShell>
  )
}
