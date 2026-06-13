/**
 * ProjectList — left-hand panel: filterable, drag-to-reorder list of projects.
 */

import { Search, X, Plus, GripVertical } from 'lucide-react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/schemas'
import { statusCfg } from './projectShared'

/** Single sortable row inside the project list */
function SortableProjectItem({
  project,
  selectedId,
  onSelect,
  dragDisabled,
}: {
  project:     Project
  selectedId:  string | null
  onSelect:    (id: string) => void
  dragDisabled: boolean
}) {
  const cfg      = statusCfg(project.status)
  const selected = project.id === selectedId

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: dragDisabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/pi flex items-stretch border-l-2 transition-colors',
        selected ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-muted/30',
      )}
    >
      {/* Drag handle */}
      {!dragDisabled && (
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="px-1 flex items-center text-muted-foreground/20 opacity-0 group-hover/pi:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}

      {/* Main clickable area */}
      <button
        onClick={() => onSelect(project.id)}
        className="flex-1 text-left px-3 py-2.5 min-w-0"
      >
        <div className="flex items-start gap-2">
          <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', cfg.dot)} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-medium leading-snug truncate', selected ? 'text-foreground' : 'text-foreground/80')}>
              {project.name}
            </p>
            {project.subtitle && (
              <p className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5 line-clamp-2">{project.subtitle}</p>
            )}
            <p className="text-[10px] text-muted-foreground/40 mt-1 font-mono">#{project.tag}</p>
          </div>
        </div>
      </button>
    </div>
  )
}

export function ProjectList({
  projects, selectedId, onSelect, search, onSearch, onReorder, onNewProject,
}: {
  projects:      Project[]
  selectedId:    string | null
  onSelect:      (id: string) => void
  search:        string
  onSearch:      (v: string) => void
  onReorder:     (reordered: Project[]) => void
  onNewProject?: () => void
}) {
  const isFiltering = search.trim() !== ''

  const filtered = isFiltering
    ? projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.tag.toLowerCase().includes(search.toLowerCase()),
      )
    : projects

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = projects.findIndex(p => p.id === active.id)
    const newIdx = projects.findIndex(p => p.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(projects, oldIdx, newIdx))
  }

  return (
    <div className="flex flex-col border-r border-border bg-card/50 w-56 shrink-0">
      {/* Search + New */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border/50">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Filter…"
            className="w-full h-7 bg-muted/30 rounded pl-6 pr-6 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/40 hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {onNewProject && (
          <button
            onClick={onNewProject}
            title="New project"
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground/40 italic">No projects match</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {filtered.map(p => (
                <SortableProjectItem
                  key={p.id}
                  project={p}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  dragDisabled={isFiltering}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
