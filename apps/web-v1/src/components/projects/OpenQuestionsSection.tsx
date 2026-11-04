/**
 * OpenQuestionsSection — collapsible open-questions panel with full CRUD:
 * cycle status (open → resolved → deferred), add/edit resolution, add new question.
 */

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenQuestion } from '@/lib/schemas'
import type { ProjectUpdater } from './projectShared'

const OQ_STATUS_CFG: Record<OpenQuestion['status'], { icon: React.ReactNode; label: string; cls: string }> = {
  open:     { icon: <AlertCircle  className="w-3 h-3" />, label: 'Open',     cls: 'text-amber-500' },
  resolved: { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Resolved', cls: 'text-green-500' },
  deferred: { icon: <Clock        className="w-3 h-3" />, label: 'Deferred', cls: 'text-muted-foreground' },
}

const OQ_CYCLE: Record<OpenQuestion['status'], OpenQuestion['status']> = {
  open: 'resolved', resolved: 'deferred', deferred: 'open',
}

export function OpenQuestionsSection({
  questions,
  onUpdate,
}: {
  questions: OpenQuestion[]
  onUpdate:  (fn: ProjectUpdater) => void
}) {
  const [collapsed,    setCollapsed]    = useState(false)
  const [addingNew,    setAddingNew]    = useState(false)
  const [newText,      setNewText]      = useState('')
  const [newBlocker,   setNewBlocker]   = useState(false)
  const [editingRes,   setEditingRes]   = useState<string | null>(null)  // oq id being resolved
  const [resDraft,     setResDraft]     = useState('')
  const addRef = useRef<HTMLTextAreaElement>(null)

  const openCount = questions.filter(q => q.status === 'open').length

  // Auto-focus new-question input when it appears
  useEffect(() => {
    if (addingNew) addRef.current?.focus()
  }, [addingNew])

  function cycleStatus(oqId: string, current: OpenQuestion['status']) {
    const next = OQ_CYCLE[current]
    onUpdate(p => {
      const q = p.openQuestions.find(q => q.id === oqId)
      if (!q) return
      q.status = next
      if (next !== 'resolved') q.resolution = null
    })
    // If moving to resolved, open the resolution editor
    if (next === 'resolved') {
      setEditingRes(oqId)
      setResDraft('')
    } else {
      if (editingRes === oqId) setEditingRes(null)
    }
  }

  function saveResolution(oqId: string) {
    onUpdate(p => {
      const q = p.openQuestions.find(q => q.id === oqId)
      if (q) q.resolution = resDraft.trim() || null
    })
    setEditingRes(null)
  }

  function submitNew() {
    const text = newText.trim()
    if (!text) return
    const id = `oq-${Date.now()}`
    onUpdate(p => {
      p.openQuestions.push({
        id, question: text, blocker: newBlocker, status: 'open', resolution: null,
      })
    })
    setNewText('')
    setNewBlocker(false)
    setAddingNew(false)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/10">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <ChevronDown className={cn('w-3 h-3 text-amber-500/70 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/70 truncate">
            Open Questions
          </span>
        </button>
        {openCount > 0 && (
          <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 shrink-0">
            {openCount} open
          </span>
        )}
        <button
          onClick={() => setAddingNew(v => !v)}
          className="p-1 rounded text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 transition-colors shrink-0"
          title="Add question"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Add-new form */}
      {addingNew && (
        <div className="px-3 py-2.5 border-t border-border/40 bg-amber-500/[0.02] space-y-2">
          <textarea
            ref={addRef}
            rows={2}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="What's the question…"
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submitNew() }
              if (e.key === 'Escape') setAddingNew(false)
            }}
            className="auto-resize w-full resize-none bg-muted/20 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/30"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newBlocker}
                onChange={e => setNewBlocker(e.target.checked)}
                className="w-3 h-3 rounded accent-red-500"
              />
              <span className="text-[10px] text-muted-foreground">Blocker</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAddingNew(false)}
                className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitNew}
                disabled={!newText.trim()}
                className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Add
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/30">⌘↵ to add · Esc to cancel</p>
        </div>
      )}

      {/* Question list */}
      {!collapsed && (
        <div className="divide-y divide-border/20">
          {questions.length === 0 && !addingNew && (
            <p className="px-3 py-3 text-xs text-muted-foreground/30 italic">No open questions</p>
          )}
          {questions.map(q => {
            const cfg = OQ_STATUS_CFG[q.status] ?? OQ_STATUS_CFG.open
            const isEditingRes = editingRes === q.id
            return (
              <div key={q.id} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  {/* Blocker dot */}
                  {q.blocker && (
                    <span className="mt-[4px] w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Blocker" />
                  )}
                  {/* Clickable status icon — cycles through states */}
                  <button
                    onClick={() => cycleStatus(q.id, q.status)}
                    className={cn('mt-[2px] shrink-0 hover:opacity-70 transition-opacity', cfg.cls)}
                    title={`${cfg.label} — click to change`}
                  >
                    {cfg.icon}
                  </button>
                  {/* Question text */}
                  <p className="text-xs text-foreground leading-snug flex-1">{q.question}</p>
                  {/* ID */}
                  <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{q.id}</span>
                </div>

                {/* Resolution area */}
                {(q.status === 'resolved' || q.resolution) && (
                  <div className="pl-9">
                    {isEditingRes ? (
                      <div className="space-y-1">
                        <textarea
                          autoFocus
                          rows={2}
                          value={resDraft}
                          onChange={e => setResDraft(e.target.value)}
                          placeholder="Resolution…"
                          onBlur={() => saveResolution(q.id)}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveResolution(q.id) }
                            if (e.key === 'Escape') setEditingRes(null)
                          }}
                          className="auto-resize w-full resize-none bg-muted/20 rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <p className="text-[10px] text-muted-foreground/30">⌘↵ save</p>
                      </div>
                    ) : (
                      <div
                        className="group/res cursor-text relative pr-4"
                        onClick={() => { setEditingRes(q.id); setResDraft(q.resolution ?? '') }}
                      >
                        {q.resolution ? (
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{q.resolution}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/30 italic">Add resolution…</p>
                        )}
                        <Pencil className="absolute right-0 top-0 w-2.5 h-2.5 text-muted-foreground/25 opacity-0 group-hover/res:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
