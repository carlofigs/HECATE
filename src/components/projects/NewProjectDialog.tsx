/**
 * NewProjectDialog — minimal form for creating a new project entry
 *
 * Required fields: name, tag
 * Optional: subtitle, owner, status
 * Everything else (timeline, openQuestions, sections, models) initialises empty.
 *
 * Tag is auto-derived from name (slugified) but editable once the user touches it.
 *
 * Uses Radix Dialog via shadcn/ui for: focus trap, aria-modal, return-focus-on-close,
 * aria-labelledby, Escape key, and backdrop-click handling.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Project, ProjectStatus } from '@/lib/schemas'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planned',     label: 'Planned'     },
  { value: 'active',      label: 'Active'       },
  { value: 'in-progress', label: 'In Progress'  },
  { value: 'paused',      label: 'Paused'       },
  { value: 'blocked',     label: 'Blocked'      },
  { value: 'completed',   label: 'Completed'    },
]

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function generateProjectId(name: string, existing: Project[]): string {
  const base = `p-${slugify(name)}` || 'p-project'
  const ids   = new Set(existing.map(p => p.id))
  let id = base, n = 2
  while (ids.has(id)) id = `${base}-${n++}`
  return id
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open:     boolean
  onClose:  () => void
  onCreate: (project: Project) => void
  existing: Project[]
}

export function NewProjectDialog({ open, onClose, onCreate, existing }: Props) {
  const [name,       setName]       = useState('')
  const [tag,        setTag]        = useState('')
  const [tagTouched, setTagTouched] = useState(false)
  const [subtitle,   setSubtitle]   = useState('')
  const [owner,      setOwner]      = useState('')
  const [status,     setStatus]     = useState<ProjectStatus>('planned')

  // Auto-derive tag from name while the user hasn't manually edited it
  useEffect(() => {
    if (!tagTouched) setTag(slugify(name))
  }, [name, tagTouched])

  // Reset form on each open
  useEffect(() => {
    if (!open) return
    setName(''); setTag(''); setTagTouched(false)
    setSubtitle(''); setOwner(''); setStatus('planned')
  }, [open])

  const canSubmit = name.trim() !== '' && tag.trim() !== ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const today = new Date().toISOString().slice(0, 10)
    const project: Project = {
      id:            generateProjectId(name.trim(), existing),
      name:          name.trim(),
      subtitle:      subtitle.trim() || null,
      summary:       null,
      status,
      phase:         null,
      currentFocus:  null,
      nextAction:    null,
      jira:          null,
      branch:        null,
      tag:           tag.trim().replace(/^#/, ''),
      owner:         owner.trim() || 'Carlo',
      updatedAt:     today,
      timeline:      [],
      openQuestions: [],
      models:        null,
      sections:      [],
    }
    onCreate(project)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-1.5">
            <Label htmlFor="np-name">
              Name <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              id="np-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="HERMES"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-tag">
              Tag <span className="text-destructive text-xs">*</span>
              <span className="ml-1.5 text-[10px] text-muted-foreground/50 font-normal">links tasks to this project</span>
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50 pointer-events-none">
                #
              </span>
              <Input
                id="np-tag"
                value={tag}
                onChange={e => { setTag(e.target.value); setTagTouched(true) }}
                placeholder="hermes"
                autoComplete="off"
                spellCheck={false}
                className="h-8 text-sm pl-5"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-subtitle">
              Subtitle
              <span className="ml-1.5 text-[10px] text-muted-foreground/40 font-normal">optional</span>
            </Label>
            <Input
              id="np-subtitle"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Engaged Sales Attribution"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-status">Status</Label>
              <select
                id="np-status"
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full h-8 rounded-md border border-input bg-transparent px-2.5 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-owner">Owner</Label>
              <Input
                id="np-owner"
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="Carlo"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit} className="h-7 text-xs">
              Create project
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  )
}
