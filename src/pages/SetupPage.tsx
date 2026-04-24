/**
 * SetupPage — GitHub credentials + app settings
 *
 * Two modes:
 *   First-run: only the credentials form is shown (no tasks loaded yet)
 *   Settings:  full page with multiple sections (credentials + column types + preferences)
 *
 * Column types live on Column.columnType in tasks.json (not settings.json)
 * so they're co-located with the data they describe.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDataFile } from '@/hooks/useDataFile'
import type { GitHubCredentials, ColumnType } from '@/lib/schemas'

const STORAGE_KEY = 'hecate:credentials'

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string; description: string }[] = [
  { value: null,         label: 'Unassigned',  description: 'Ignored by Archive and Week Log' },
  { value: 'backlog',    label: 'Backlog',      description: 'Tasks not yet started'           },
  { value: 'in-progress',label: 'In Progress',  description: 'Carried forward in Week Log'     },
  { value: 'done',       label: 'Done',         description: 'Archived at sprint close'        },
  { value: 'not-doing',  label: 'Not Doing',    description: 'Archived as dropped tasks'       },
]

// ─── Credentials section ─────────────────────────────────────────────────────

function CredentialsSection({ isFirstRun }: { isFirstRun: boolean }) {
  const navigate = useNavigate()

  const existing: GitHubCredentials | null = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })()

  const [token,   setToken]   = useState(existing?.token ?? '')
  const [owner,   setOwner]   = useState(existing?.owner ?? '')
  const [repo,    setRepo]    = useState(existing?.repo  ?? '')
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

// ─── Column types section ─────────────────────────────────────────────────────

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
            {/* Column name */}
            <span className="flex-1 min-w-0 text-sm text-foreground truncate">
              {col.name}
            </span>
            {/* Type selector */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate   = useNavigate()
  const isFirstRun = !localStorage.getItem(STORAGE_KEY)

  // First-run: minimal centered credentials form
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

  // Settings mode: full page
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

      {/* Sections */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-8">

          {/* ── Column Types ──────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Column Types
              </h2>
              <p className="text-xs text-muted-foreground/70">
                Assign each column a semantic role. Used by Archive and Week Log to
                identify which tasks to snapshot.
              </p>
            </div>
            <ColumnTypesSection />
          </section>

          <div className="border-t border-border" />

          {/* ── GitHub Credentials ────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                GitHub Credentials
              </h2>
              <p className="text-xs text-muted-foreground/70">
                Fine-grained PAT with <em>Contents</em> read/write on your data repo.
                Stored locally — never sent anywhere except GitHub.
              </p>
            </div>
            <CredentialsSection isFirstRun={false} />
          </section>

        </div>
      </div>
    </div>
  )
}
