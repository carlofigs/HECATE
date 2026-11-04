/**
 * ProjectDetail — right-hand master-detail panel for the selected project:
 * header, focus/next-action callout, and the collapsible sub-sections.
 */

import { cn } from '@/lib/utils'
import type { Project } from '@/lib/schemas'
import { STATUS_CONFIG, statusCfg, type ProjectUpdater } from './projectShared'
import { InlineTextField } from './ProjectInlineTextField'
import { LinkedTasksSection } from './LinkedTasksSection'
import { OpenQuestionsSection } from './OpenQuestionsSection'
import { RoadmapSection } from './RoadmapSection'
import { ProjectSectionCard } from './ProjectSectionCard'
import { ModelsSection } from './ModelsSection'

export function ProjectDetail({
  project,
  onUpdate,
}: {
  project:  Project
  onUpdate: (fn: ProjectUpdater) => void
}) {
  const cfg = statusCfg(project.status)

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* ── Header ── */}
        <div className="space-y-2">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground leading-tight">{project.name}</h1>
              {project.subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{project.subtitle}</p>
              )}
            </div>

            {/* Status badge — transparent <select> overlaid so clicking the badge opens the dropdown */}
            <div className="relative shrink-0 mt-0.5" title="Click to change status">
              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border cursor-pointer select-none', cfg.badge)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <select
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[11px]"
                value={project.status}
                onChange={e => onUpdate(p => {
                  p.status = e.target.value as Project['status']
                })}
              >
                {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary — inline-editable paragraph */}
          <div className="border-t border-border/30 pt-2">
            <InlineTextField
              value={project.summary}
              placeholder="Add a summary — what is this project about?"
              onSave={v => onUpdate(p => { p.summary = v })}
            />
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
            <span>Owner: <span className="text-foreground/80">{project.owner}</span></span>
            {project.phase && (
              <span>Phase: <span className="text-foreground/80">{project.phase}</span></span>
            )}
            {project.jira && (
              <span className="inline-flex items-center gap-1">
                Jira:
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400 dark:text-blue-300 ml-0.5">
                  {project.jira}
                </span>
              </span>
            )}
            {project.branch && (
              <span className="hidden sm:inline">Branch: <span className="font-mono text-foreground/80 text-[10px]">{project.branch}</span></span>
            )}
            <span>Updated: <span className="text-foreground/80">{project.updatedAt}</span></span>
          </div>
        </div>

        {/* ── Focus / Next Action callout (inline-editable) ── */}
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Current Focus</p>
            <InlineTextField
              value={project.currentFocus}
              placeholder="What's the current focus of this project?"
              onSave={v => onUpdate(p => { p.currentFocus = v })}
            />
          </div>
          {(project.currentFocus || project.nextAction) && (
            <div className="pt-2 border-t border-sky-500/15" />
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500/70 mb-1">Next Action</p>
            <InlineTextField
              value={project.nextAction}
              placeholder="What's the immediate next action?"
              onSave={v => onUpdate(p => { p.nextAction = v })}
            />
          </div>
        </div>

        {/* ── Linked Tasks ── */}
        <LinkedTasksSection tag={project.tag} />

        {/* ── Open Questions (full CRUD) ── */}
        <OpenQuestionsSection questions={project.openQuestions} onUpdate={onUpdate} />

        {/* ── Roadmap ── */}
        {project.timeline.length > 0 && <RoadmapSection timeline={project.timeline} />}

        {/* ── Sections (markdown, inline-editable) ── */}
        {project.sections.map(section => (
          <ProjectSectionCard key={section.id} section={section} onUpdate={onUpdate} />
        ))}

        {/* ── Models ── */}
        {project.models && project.models.length > 0 && (
          <ModelsSection models={project.models} />
        )}
      </div>
    </div>
  )
}
