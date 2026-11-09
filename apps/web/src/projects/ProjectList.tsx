import { formatDay, projectList, todayIn, type ProjectRow, type WorkspaceState } from '@hecate/core'
import { Badge, Button, EmptyState } from '@hecate/ui'
import { FolderOpen, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { ICON, Section } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import { useActions } from '../useActions.ts'
import { useNow } from '../useNow.ts'
import { STATUS_LABEL } from './project.ts'
import { ProjectEditor } from './ProjectEditor.tsx'
import { STATUS_TONE } from './status.ts'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Every project, live ones first, each with what needs attention. design/components/project-pages.md */
export function ProjectList() {
  const now = useNow()
  const { workspace = '' } = useParams()
  const navigate = useNavigate()
  const slot = useBottomActionSlot()
  const actions = useActions()
  const [creating, setCreating] = useState(false)
  const base = `/w/${encodeURIComponent(workspace)}/projects`

  const newProject = (
    <Button variant="primary" icon={<Plus aria-hidden="true" className={ICON} />} onClick={() => setCreating(true)}>
      New project
    </Button>
  )
  return (
    <>
      <PageShell title="Projects" actions={<div className="max-md:hidden">{newProject}</div>}>
        {snapshot => (
          <>
            <ListBody state={snapshot.state} rows={projectList(snapshot.state, todayIn(snapshot.state.workspace.timezone, now))} action={newProject} />
            {creating ? (
              <ProjectEditor
                state={snapshot.state}
                project={null}
                onClose={() => setCreating(false)}
                onCreated={slug => void navigate(`${base}/${slug}`)}
                save={actions.save}
              />
            ) : null}
          </>
        )}
      </PageShell>
      {slot ? createPortal(newProject, slot) : null}
    </>
  )
}

function Row({ row }: { row: ProjectRow }) {
  const deadline = row.nextDeadline
  return (
    <li className="flex flex-col gap-stack-xs">
      <span className="flex flex-wrap items-baseline gap-inline-sm">
        <Link to={row.slug} className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-link underline">
          {row.name}
        </Link>
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      </span>
      {row.subtitle ? <span className="text-body-sm text-text-secondary">{row.subtitle}</span> : null}
      <span className="flex flex-wrap items-baseline gap-x-inline-md gap-y-stack-xs text-body-sm text-text-secondary">
        <span>{plural(row.openTasks, 'open task', 'open tasks')}</span>
        {row.openQuestions > 0 ? (
          <span>
            {plural(row.openQuestions, 'open question', 'open questions')}
            {row.blockers > 0 ? `, ${row.blockers} blocking` : ''}
          </span>
        ) : null}
        {deadline ? (
          <span className="inline-flex flex-wrap items-baseline gap-inline-xs">
            Next deadline {formatDay(deadline.date)}: {deadline.title}
            {deadline.hard ? <Badge tone="warning">Hard</Badge> : null}
            {deadline.overdue ? <Badge tone="danger">Overdue</Badge> : null}
          </span>
        ) : null}
        {row.phase ? <span>Phase: {row.phase}</span> : null}
      </span>
    </li>
  )
}

function ListBody({ state, rows, action }: { state: WorkspaceState; rows: ProjectRow[]; action: ReactNode }) {
  if (Object.keys(state.projects).length === 0) {
    return (
      <EmptyState icon={<FolderOpen aria-hidden="true" className={ICON} />} title="No projects yet" action={action}>
        A project gathers its tasks, deadlines, cutoffs and open questions in one place.
      </EmptyState>
    )
  }
  const closed = rows.filter(r => !r.live)
  return (
    <div className="grid gap-stack-lg lg:grid-cols-2">
      <Section id="live" title="Live" empty="No live projects.">
        {rows.filter(r => r.live).map(r => <Row key={r.slug} row={r} />)}
      </Section>
      {closed.length > 0 ? (
        <Section id="closed" title="Closed">
          {closed.map(r => <Row key={r.slug} row={r} />)}
        </Section>
      ) : null}
    </div>
  )
}
