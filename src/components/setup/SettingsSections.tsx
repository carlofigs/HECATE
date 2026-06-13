/**
 * The preference sections of the Settings page: 1:1 people, default Tasks view,
 * auto-save debounce, sync polling interval, and per-column semantic types.
 */

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Kanban, LayoutList, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDataFile } from '@/hooks/useDataFile'
import { useSettings } from '@/hooks/useSettings'
import { TASKS_VIEW_STORAGE_KEY } from '@/lib/taskConstants'
import { cn } from '@/lib/utils'
import type { ColumnType } from '@/lib/schemas'
import { SelectSetting, type SelectOption } from './setupShared'

// ─── 1:1 People ────────────────────────────────────────────────────────────────

export function OneOnOnePeopleSection() {
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

// ─── Default Tasks view ────────────────────────────────────────────────────────

export function DefaultViewSection() {
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

// ─── Auto-save debounce ────────────────────────────────────────────────────────

const DEBOUNCE_OPTIONS: SelectOption[] = [
  { value: 500,  label: '0.5 s — aggressive' },
  { value: 1000, label: '1 s'                },
  { value: 2000, label: '2 s  (default)'     },
  { value: 5000, label: '5 s — conservative' },
]

export function AutoSaveSection() {
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

// ─── Poll interval ─────────────────────────────────────────────────────────────

const POLL_OPTIONS: SelectOption[] = [
  { value: 0,      label: 'Off'    },
  { value: 60000,  label: '1 min'  },
  { value: 300000, label: '5 min'  },
  { value: 900000, label: '15 min' },
]

export function PollIntervalSection() {
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

// ─── Column types ──────────────────────────────────────────────────────────────

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string; description: string }[] = [
  { value: null,          label: 'Unassigned',  description: 'Ignored by Archive and Week Log' },
  { value: 'backlog',     label: 'Backlog',      description: 'Tasks not yet started'           },
  { value: 'in-progress', label: 'In Progress',  description: 'Carried forward in Week Log'     },
  { value: 'done',        label: 'Done',         description: 'Archived at sprint close'        },
  { value: 'not-doing',   label: 'Not Doing',    description: 'Archived as dropped tasks'       },
]

export function ColumnTypesSection() {
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
