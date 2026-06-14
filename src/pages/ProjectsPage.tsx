/**
 * ProjectsPage — master-detail Projects view.
 *
 * Layout: a filterable, drag-to-reorder ProjectList (left) and a ProjectDetail
 * panel (right) for the selected project. The detail sub-sections (header,
 * focus/next-action callout, linked tasks, open questions, roadmap, free-form
 * sections, models) live in src/components/projects/. All edits flow through the
 * shared setData → auto-save and auto-stamp updatedAt.
 */

import { useState, useCallback } from 'react'
import { Plus, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDataFile } from '@/hooks/useDataFile'
import { NewProjectDialog } from '@/components/projects/NewProjectDialog'
import { ProjectList } from '@/components/projects/ProjectList'
import { ProjectDetail } from '@/components/projects/ProjectDetail'
import type { ProjectUpdater } from '@/components/projects/projectShared'
import type { Project } from '@/lib/schemas'

export default function ProjectsPage() {
  const { data: projectsData, setData, error: projectsError, reload: reloadProjects } = useDataFile('projects')

  const projects    = projectsData?.projects ?? []
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [newProjectOpen,  setNewProjectOpen]  = useState(false)
  // On mobile (< lg) we show one pane at a time; selecting a project opens its
  // detail full-width. Ignored at lg+, where both panes are always visible.
  const [mobileDetail,    setMobileDetail]    = useState(false)

  const openProject = useCallback((id: string) => {
    setSelectedId(id)
    setMobileDetail(true)
  }, [])

  const resolvedId = selectedId ?? projects[0]?.id ?? null
  const selected   = projects.find(p => p.id === resolvedId) ?? null

  const handleUpdate = useCallback((fn: ProjectUpdater) => {
    if (!resolvedId) return
    setData(draft => {
      const p = draft.projects.find(pr => pr.id === resolvedId)
      if (!p) return
      fn(p)
      p.updatedAt = new Date().toISOString().slice(0, 10)
    })
  }, [resolvedId, setData])

  const handleReorder = useCallback((reordered: Project[]) => {
    setData(draft => { draft.projects = reordered })
  }, [setData])

  const handleCreate = useCallback((project: Project) => {
    setData(draft => { draft.projects.unshift(project) })
    setSelectedId(project.id)
    setNewProjectOpen(false)
  }, [setData])

  if (projectsError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm text-destructive">Failed to load projects</p>
        <p className="text-xs opacity-60">{projectsError}</p>
        <button
          onClick={reloadProjects}
          className="mt-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!projectsData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-2 w-64">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <>
        <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">No projects yet</p>
          <button
            onClick={() => setNewProjectOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New project
          </button>
        </div>
        <NewProjectDialog
          open={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          onCreate={handleCreate}
          existing={projects}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex h-full overflow-hidden">
        <ProjectList
          projects={projects}
          selectedId={resolvedId}
          onSelect={openProject}
          search={search}
          onSearch={setSearch}
          onReorder={handleReorder}
          onNewProject={() => setNewProjectOpen(true)}
          className={cn(mobileDetail && 'hidden lg:flex')}
        />
        <div className={cn('flex-1 min-w-0 flex flex-col', !mobileDetail && 'hidden lg:flex')}>
          {/* Mobile-only back bar */}
          <button
            onClick={() => setMobileDetail(false)}
            className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-border text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Projects
          </button>
          {selected ? (
            <ProjectDetail project={selected} onUpdate={handleUpdate} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a project
            </div>
          )}
        </div>
      </div>
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreate}
        existing={projects}
      />
    </>
  )
}
