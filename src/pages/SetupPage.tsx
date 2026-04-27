/**
 * SetupPage — GitHub credentials + app settings
 *
 * Two modes:
 *   First-run: minimal centred credentials form (no data loaded yet)
 *   Settings:  full page — preferences, column types, credentials
 *
 * Sections (settings mode):
 *   1. 1:1 People          — list of names used by WeekLog "Generate Week"
 *   2. Tasks Default View  — board / list
 *   3. Auto-save Debounce  — how long to wait before writing to GitHub
 *   4. Sync Polling        — background re-fetch interval
 *   5. Column Types        — semantic role per Kanban column (reads tasks.json)
 *   6. GitHub Credentials  — PAT, owner, repo
 */

import { useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft, Kanban, LayoutList, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDataFile } from '@/hooks/useDataFile'
import { useSettings } from '@/hooks/useSettings'
import { TASKS_VIEW_STORAGE_KEY } from '@/lib/taskConstants'
import { cn } from '@/lib/utils'
import type { GitHubCredentials, ColumnType } from '@/lib/schemas'

const STORAGE_KEY = 'hecate:credentials'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readStoredCredentials(): GitHubCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ─── Shared section wrapper ───────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title:        string
  description?: ReactNode
  children:     ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground/70">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

// ─── Shared select + hint control ────────────────────────────────────────────

interface SelectOption { value: number; label: string }

function SelectSetting({
  value,
  options,
  onChange,
  hint,
}: {
  value:    number
  options:  SelectOption[]
  onChange: (value: number) => void
  hint:     string
}) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-transparent px-2.5 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground/50">{hint}</p>
    </div>
  )
}

// ─── 1:1 People section ───────────────────────────────────────────────────────

function OneOnOnePeopleSection() {
  const { settings, updateSettings, saveSettings } = useSettings()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const people = settings.oneOnOnePeople

  async function addPerson() {
    const name = draft.trim()
    // Case-insensitive dedup: "James" and "james" are the same person
    if (!name || people.some(p => p.toLowerCase() === name.toLowerCase())) return
    updateSettings(d => { d.oneOnOnePeople = [...d.oneOnOnePeople, name] })
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save settings')
    }
    setDraft('')
    inputRef.current?.focus()
  }

  async function removePerson(name: string) {
    updateSettings(d => { d.oneOnOnePeople = d.oneOnOnePeople.filter(p => p !== name) })
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save settings')
    }
  }

  return (
    <div className="space-y-2.5">
      {/* Current people pills */}
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {people.map(person => (
            <span
              key={person}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/60 text-foreground border border-border"
            >
              {person}
              <button
                onClick={() => removePerson(person)}
                aria-label={`Remove ${person}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add input */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } }}
          placeholder="Add person…"
          className="h-8 text-xs"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPerson}
          disabled={!draft.trim()}
          className="h-8 px-2.5 gap-1 text-xs shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {people.length === 0 && (
        <p className="text-[11px] text-muted-foreground/50">
          No people added. These names appear as editable sections in each generated week log.
        </p>
      )}
    </div>
  )
}

// ─── Default view section ─────────────────────────────────────────────────────

function DefaultViewSection() {
  const { settings, updateSettings, saveSettings } = useSettings()
  const view = settings.defaultView

  async function set(v: 'board' | 'list') {
    updateSettings(d => { d.defaultView = v })
    // Also sync the per-session key so the Tasks page picks it up immediately
    localStorage.setItem(TASKS_VIEW_STORAGE_KEY, v)
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save settings')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center rounded-md border border-border overflow-hidden w-fit">
        <button
          onClick={() => set('board')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            view === 'board'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          <Kanban className="w-3.5 h-3.5" />
          Board
        </button>
        <button
          onClick={() => set('list')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l border-border',
            view === 'list'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          <LayoutList className="w-3.5 h-3.5" />
          List
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/50">
        The view Tasks opens in by default. You can still toggle it per-session from the Tasks header.
      </p>
    </div>
  )
}

// ─── Auto-save debounce section ───────────────────────────────────────────────

const DEBOUNCE_OPTIONS: SelectOption[] = [
  { value: 500,  label: '0.5 s — aggressive' },
  { value: 1000, label: '1 s'                },
  { value: 2000, label: '2 s  (default)'     },
  { value: 5000, label: '5 s — conservative' },
]

function AutoSaveSection() {
  const { settings, updateSettings, saveSettings } = useSettings()

  async function handleChange(ms: number) {
    updateSettings(d => { d.autoSaveDebounceMs = ms })
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save settings')
    }
  }

  return (
    <SelectSetting
      value={settings.autoSaveDebounceMs}
      options={DEBOUNCE_OPTIONS}
      onChange={handleChange}
      hint="How long HECATE waits after your last edit before committing to GitHub. Lower = more commits; higher = fewer API calls."
    />
  )
}

// ─── Poll interval section ────────────────────────────────────────────────────

const POLL_OPTIONS: SelectOption[] = [
  { value: 0,      label: 'Off'    },
  { value: 60000,  label: '1 min'  },
  { value: 300000, label: '5 min'  },
  { value: 900000, label: '15 min' },
]

function PollIntervalSection() {
  const { settings, updateSettings, saveSettings } = useSettings()

  async function handleChange(ms: number) {
    updateSettings(d => { d.pollIntervalMs = ms })
    try {
      await saveSettings()
    } catch {
      toast.error('Failed to save settings')
    }
  }

  return (
    <SelectSetting
      value={settings.pollIntervalMs}
      options={POLL_OPTIONS}
      onChange={handleChange}
      hint="How often HECATE checks GitHub for changes made elsewhere (e.g. by Claude). Off disables background polling entirely."
    />
  )
}

// ─── Column types section ─────────────────────────────────────────────────────

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string; description: string }[] = [
  { value: null,          label: 'Unassigned',  description: 'Ignored by Archive and Week Log' },
  { value: 'backlog',     label: 'Backlog',      description: 'Tasks not yet started'           },
  { value: 'in-progress', label: 'In Progress',  description: 'Carried forward in Week Log'     },
  { value: 'done',        label: 'Done',         description: 'Archived at sprint close'        },
  { value: 'not-doing',   label: 'Not Doing',    description: 'Archived as dropped tasks'       },
]

function ColumnTypesSection() {
  const { data, loading, error, setData } = useDataFile('tasks')

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-9 rounded-md bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="text-xs text-muted-foreground/60 italic">
        {error ? `Could not load columns: ${error}` : 'No task data found.'}
      </p>
    )
  }

  if (data.columns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60 italic">
        No columns defined yet — add columns in the Tasks view first.
      </p>
    )
  }

  function setColumnType(colId: string, type: ColumnType) {
    setData(draft => {
      const col = draft.columns.find(c => c.id === colId)
      if (col) col.columnType = type
    })
  }

  return (
    <div className="space-y-2">
      {data.columns.map(col => {
        const current = col.columnType ?? null
        const option  = COLUMN_TYPE_OPTIONS.find(o => o.value === current)
        return (
          <div key={col.id} className="flex items-center gap-3">
            <span className="flex-1 min-w-0 text-sm text-foreground truncate">{col.name}</span>
            <select
              value={current ?? ''}
              onChange={e => {
                const v = e.target.value
                setColumnType(col.id, (v === '' ? null : v) as ColumnType)
              }}
              className="w-36 h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title={option?.description}
            >
              {COLUMN_TYPE_OPTIONS.map(opt => (
                <option key={opt.value ?? '__null'} value={opt.value ?? ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground/50 pt-1">
        Changes auto-save. Column types control which tasks are archived and included in the week log.
      </p>
    </div>
  )
}

// ─── Credentials section ──────────────────────────────────────────────────────

function CredentialsSection({ isFirstRun }: { isFirstRun: boolean }) {
  const navigate = useNavigate()

  // Lazy initialisers — read localStorage once on mount, not on every render
  const [token,   setToken]   = useState(() => readStoredCredentials()?.token ?? '')
  const [owner,   setOwner]   = useState(() => readStoredCredentials()?.owner ?? '')
  const [repo,    setRepo]    = useState(() => readStoredCredentials()?.repo  ?? '')
  const [testing, setTesting] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = { token: token.trim(), owner: owner.trim(), repo: repo.trim() }
    if (!trimmed.token || !trimmed.owner || !trimmed.repo) {
      toast.error('All fields are required')
      return
    }
    setTesting(true)
    try {
      const res = await fetch(
        `https://api.github.com/repos/${trimmed.owner}/${trimmed.repo}`,
        { headers: { Authorization: `Bearer ${trimmed.token}`, Accept: 'application/vnd.github+json' } },
      )
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: res.statusText }))
        toast.error(`GitHub API error: ${message}`)
        return
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      toast.success(isFirstRun ? 'Connected — welcome to HECATE' : 'Credentials updated')
      if (isFirstRun) navigate('/focus', { replace: true })
    } catch (err) {
      toast.error('Network error — check your connection')
      console.error(err)
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="token">Personal Access Token</Label>
        <Input
          id="token"
          type="password"
          placeholder="github_pat_…"
          value={token}
          onChange={e => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="owner">Owner</Label>
          <Input
            id="owner"
            placeholder="carlofigs"
            value={owner}
            onChange={e => setOwner(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repo">Repository</Label>
          <Input
            id="repo"
            placeholder="HECATE"
            value={repo}
            onChange={e => setRepo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <Button type="submit" className={isFirstRun ? 'w-full' : ''} disabled={testing}>
        {testing ? 'Verifying…' : isFirstRun ? 'Save & connect' : 'Update credentials'}
      </Button>
      {isFirstRun && (
        <p className="text-center text-xs text-muted-foreground">
          Stored in <code className="font-mono">localStorage</code> — never sent anywhere except GitHub.
        </p>
      )}
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate   = useNavigate()
  const isFirstRun = !localStorage.getItem(STORAGE_KEY)

  // First-run: minimal centred credentials form
  if (isFirstRun) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">HECATE</p>
            <h1 className="text-xl font-semibold text-foreground">Connect your repository</h1>
            <p className="text-sm text-muted-foreground">
              A fine-grained GitHub PAT with <em>Contents</em> read/write access on your data repo.
            </p>
          </div>
          <CredentialsSection isFirstRun />
        </div>
      </div>
    )
  }

  // Settings mode
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-8">

          <Section
            title="1:1 People"
            description="Names that appear as dedicated prep sections when generating a week log. Press Enter or click Add."
          >
            <OneOnOnePeopleSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Tasks Default View"
            description="Which view the Tasks page opens in. Overrideable per-session from the Tasks header."
          >
            <DefaultViewSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Auto-save Debounce"
            description="How long HECATE waits after your last edit before writing to GitHub."
          >
            <AutoSaveSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Sync Polling"
            description="Background check for changes made outside HECATE (e.g. by Claude or direct edits). Shows a reload banner when remote changes are detected."
          >
            <PollIntervalSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="Column Types"
            description="Assign each Kanban column a semantic role. Used by Archive and Week Log to identify which tasks to snapshot."
          >
            <ColumnTypesSection />
          </Section>

          <div className="border-t border-border" />

          <Section
            title="GitHub Credentials"
            description={<>Fine-grained PAT with <em>Contents</em> read/write on your data repo. Stored in <code className="font-mono text-[11px]">localStorage</code> — never sent anywhere except GitHub.</>}
          >
            <CredentialsSection isFirstRun={false} />
          </Section>

        </div>
      </div>
    </div>
  )
}
