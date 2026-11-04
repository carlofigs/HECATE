/**
 * MemoryPage — read-only view of memory.json, organised into tabs.
 *
 * Tabs: Me · People · Terms · Projects · Recurring · Preferences · References.
 * Each tab is its own component under src/components/memory/. All tabs are
 * read-only — Memory is managed by the memory-pipeline skill, not edited inline.
 */

import { useState, useCallback } from 'react'
import { useDataFile } from '@/hooks/useDataFile'
import { PageShell } from '@/components/layout/PageShell'
import { cn } from '@/lib/utils'
import { MeTab } from '@/components/memory/MeTab'
import { PeopleTab } from '@/components/memory/PeopleTab'
import { TermsTab } from '@/components/memory/TermsTab'
import { ProjectsTab } from '@/components/memory/ProjectsTab'
import { RecurringTab } from '@/components/memory/RecurringTab'
import { PreferencesTab } from '@/components/memory/PreferencesTab'
import { ReferencesTab } from '@/components/memory/ReferencesTab'

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId =
  | 'me'
  | 'people'
  | 'terms'
  | 'projects'
  | 'recurring'
  | 'preferences'
  | 'references'

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
