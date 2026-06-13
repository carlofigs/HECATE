/**
 * ProjectSectionCard — a free-form markdown section: collapsible, inline-editable.
 */

import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import type { ProjectSection } from '@/lib/schemas'
import type { ProjectUpdater } from './projectShared'

export function ProjectSectionCard({
  section,
  onUpdate,
}: {
  section:  ProjectSection
  onUpdate: (fn: ProjectUpdater) => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [draft,     setDraft]     = useState({ title: section.title, content: section.content })

  function startEdit(e: React.MouseEvent) { e.stopPropagation(); setDraft({ title: section.title, content: section.content }); setEditing(true); setCollapsed(false) }
  function save()    { onUpdate(p => { const s = p.sections.find(s => s.id === section.id); if (s) { s.title = draft.title.trim() || s.title; s.content = draft.content } }); setEditing(false) }
  function discard() { setEditing(false) }

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden p-3 space-y-2">
        <input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          className="w-full bg-transparent text-xs font-semibold text-foreground border-b border-border/50 pb-1 focus:outline-none focus:border-primary"
        />
        <textarea
          autoFocus
          value={draft.content}
          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') discard() }}
          className="auto-resize w-full resize-none bg-transparent text-xs text-foreground font-mono focus:outline-none leading-relaxed"
          rows={4}
        />
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground/40">⌘↵ save · Esc discard</span>
          <div className="flex items-center gap-1.5">
            <button onClick={discard} className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Discard</button>
            <button onClick={save}    className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Save</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 hover:bg-muted/20 transition-colors">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <ChevronDown className={cn('w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0', collapsed && '-rotate-90')} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1 text-left">
            {section.title}
          </span>
        </button>
        <button
          onClick={startEdit}
          className="p-1 rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          title="Edit section"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-3 border-t border-border/40 group">
          {section.content.trim() ? (
            <div className="relative">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
              </div>
              <button
                onClick={startEdit}
                className="absolute top-0 right-0 p-1 rounded text-muted-foreground/25 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <p
              className="text-xs text-muted-foreground/30 italic cursor-text"
              onClick={startEdit}
            >
              Empty — click to add content
            </p>
          )}
        </div>
      )}
    </div>
  )
}
