import { formatDay, personLabel, projectView, todayIn, type FoundTask, type ProjectView, type WorkspaceState } from '@hecate/core'
import { Badge, Button, buttonStyles, EmptyState, KeyChip, Markdown, type MenuItem } from '@hecate/ui'
import { Pencil, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams, useSearchParams } from 'react-router'
import { useApp } from '../appStore.ts'
import { TaskEditor } from '../board/TaskEditor.tsx'
import { ICON, Item, Keys, Section, TaskLine } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import { useActions } from '../useActions.ts'
import { useNow } from '../useNow.ts'
import {
  canMoveAction, itemName, moveActionOps, questionLabel, removeItemOps, restoreItemOps, STATUS_LABEL, type ItemKind, type Project,
} from './project.ts'
import { ProjectEditor } from './ProjectEditor.tsx'
import { ITEM_COPY, ProjectItemEditor } from './ProjectItemEditor.tsx'
import { STATUS_TONE } from './status.ts'

const QUESTION = { open: { tone: 'info', label: 'Open' }, resolved: { tone: 'success', label: 'Resolved' }, deferred: { tone: 'neutral', label: 'Deferred' } } as const
const TIMELINE = { done: 'Done', active: 'Active', pending: 'Pending', deferred: 'Deferred' } as const

/**
 * One project and everything linked to it: tasks (archived ones included,
 * by sprint), next actions, open questions, deadlines and cutoffs, from
 * core's projectView. Task titles open the task editor here.
 * design/components/project-pages.md
 */
export function ProjectPage() {
  const now = useNow()
  const { workspace = '', slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const slot = useBottomActionSlot()
  const name = useApp(s => s.open?.view?.projects[slug]?.name)
  const base = `/w/${encodeURIComponent(workspace)}/projects`

  const startNew = (): void =>
    setParams(p => {
      const next = new URLSearchParams(p)
      next.delete('task')
      next.set('new', '1')
      return next
    })
  const newTask = (
    <Button variant="primary" icon={<Plus aria-hidden="true" className={ICON} />} onClick={startNew}>
      New task
    </Button>
  )
  return (
    <>
      <PageShell
        title={name ?? 'Project'}
        back={{ to: base, label: 'Projects' }}
        subtitle={snapshot => {
          const p = snapshot.state.projects[slug]
          return p?.subtitle ? <p>{p.subtitle}</p> : null
        }}
        actions={name ? <div className="max-md:hidden">{newTask}</div> : undefined}
      >
        {snapshot => (
          <ProjectBody state={snapshot.state} slug={slug} base={base} view={projectView(snapshot.state, slug, todayIn(snapshot.state.workspace.timezone, now))} params={params} setParams={setParams} />
        )}
      </PageShell>
      {slot && name ? createPortal(newTask, slot) : null}
    </>
  )
}

interface BodyProps {
  state: WorkspaceState
  slug: string
  base: string
  view: ProjectView | null
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
}

function ProjectBody({ state, slug, base, view, params, setParams }: BodyProps) {
  const actions = useActions()
  const [editing, setEditing] = useState<{ kind: ItemKind; id: string | null } | null>(null)
  const [overview, setOverview] = useState(false)

  if (!view) {
    return (
      <EmptyState title={`No project “${slug}”`} action={<Link to={base} className={buttonStyles('secondary')}>All projects</Link>}>
        There is no project with this address in this workspace. It may have been renamed in the data, or the link is wrong.
      </EmptyState>
    )
  }

  const p: Project = view.project
  const closeEditor = (): void =>
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('task')
      next.delete('new')
      return next
    })
  const edit = (kind: ItemKind, id: string | null = null) => () => setEditing({ kind, id })
  /** Removing an item: the whole list without it, with an exact Undo. */
  const remove = (kind: ItemKind, id: string) => () =>
    actions.change(removeItemOps(p, kind, id), `Remove from ${ITEM_COPY[kind].list} of ${p.name}`, {
      title: `Removed from ${ITEM_COPY[kind].list}`,
      description: itemName(p, kind, id),
      undo: restoreItemOps(p, kind),
    })
  const actionMenu = (id: string): MenuItem[] => {
    const move = (delta: -1 | 1) => () =>
      actions.change(moveActionOps(p, id, delta), `Reorder the next actions of ${p.name}`, {
        title: delta < 0 ? 'Moved up' : 'Moved down',
        description: itemName(p, 'action', id),
        undo: restoreItemOps(p, 'action'),
      })
    return [
      { label: 'Move up', onSelect: move(-1), disabled: !canMoveAction(p, id, -1) },
      { label: 'Move down', onSelect: move(1), disabled: !canMoveAction(p, id, 1) },
      { kind: 'separator' },
      { label: 'Remove', onSelect: remove('action', id) },
    ]
  }
  const add = (kind: ItemKind) => (
    <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={edit(kind)}>
      {ITEM_COPY[kind].add}
    </Button>
  )

  return (
    <div className="grid gap-stack-lg lg:grid-cols-2">
      <div className="flex flex-col gap-stack-lg">
        <Section
          id="overview"
          title="Overview"
          aside={<Overview project={p} />}
          footer={
            <Button icon={<Pencil aria-hidden="true" className={ICON} />} onClick={() => setOverview(true)}>
              Edit overview
            </Button>
          }
        >
          {[]}
        </Section>

        <Section id="next-actions" title="Next actions" empty="No next actions." footer={add('action')}>
          {p.nextActions.map(a => (
            <Item key={a.id} name={a.text} onEdit={edit('action', a.id)} menu={actionMenu(a.id)}>
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-body-md text-text-primary">{a.text}</span>
                <Keys keys={a.keys} />
              </span>
            </Item>
          ))}
        </Section>

        <Section id="questions" title="Open questions" empty="No open questions." footer={add('question')}>
          {p.openQuestions.map(q => (
            <Item key={q.id} name={questionLabel(q.n)} onEdit={edit('question', q.id)} onRemove={remove('question', q.id)}>
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-label text-text-secondary">{questionLabel(q.n)}</span>
                <Badge tone={QUESTION[q.status].tone}>{QUESTION[q.status].label}</Badge>
                {q.blocker ? <Badge tone="danger">Blocker</Badge> : null}
                <Keys keys={q.keys} />
              </span>
              <div className="text-body-md text-text-primary">
                <Markdown>{q.question}</Markdown>
              </div>
              {q.resolution ? (
                <div className="text-body-sm text-text-secondary">
                  <Markdown>{q.resolution}</Markdown>
                </div>
              ) : null}
            </Item>
          ))}
        </Section>

        {p.timeline.length > 0 ? (
          <Section id="timeline" title="Timeline">
            {p.timeline.map(t => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-body-md text-text-primary">{t.phase}</span>
                <Badge tone={t.status === 'active' ? 'accent' : 'neutral'}>{TIMELINE[t.status]}</Badge>
                {t.start || t.end ? (
                  <span className="text-body-sm text-text-secondary">{[t.start ? formatDay(t.start) : '…', t.end ? formatDay(t.end) : '…'].join(' – ')}</span>
                ) : null}
              </li>
            ))}
          </Section>
        ) : null}

        {p.sections.map(section => (
          <Section key={section.id} id={`section-${section.id}`} title={section.title} aside={<Markdown>{section.content}</Markdown>}>
            {[]}
          </Section>
        ))}
      </div>

      <div className="flex flex-col gap-stack-lg">
        <Tasks tasks={view.tasks} />

        <Section id="deadlines" title="Deadlines" empty="No deadlines." footer={add('deadline')}>
          {view.deadlines.map(d => (
            <Item key={d.id} name={d.title} onEdit={edit('deadline', d.id)} onRemove={remove('deadline', d.id)}>
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-label text-text-secondary">{formatDay(d.date)}</span>
                <span className="text-body-md text-text-primary">{d.title}</span>
                {d.hard ? <Badge tone="warning">Hard deadline</Badge> : null}
                {d.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                <Keys keys={d.keys} />
              </span>
              {d.note ? <span className="text-body-sm text-text-secondary">{d.note}</span> : null}
            </Item>
          ))}
        </Section>

        <Section id="cutoffs" title="Cutoffs" empty="No cutoffs." footer={add('cutoff')}>
          {[...p.cutoffs].sort((a, b) => a.date.localeCompare(b.date)).map(c => (
            <Item key={c.id} name={itemName(p, 'cutoff', c.id)} onEdit={edit('cutoff', c.id)} onRemove={remove('cutoff', c.id)}>
              <span className="flex flex-wrap items-baseline gap-inline-sm">
                <span className="text-label text-text-secondary">{formatDay(c.date)}</span>
                <span className="text-body-md text-text-primary">{personLabel(state, c.personId) ?? c.who}</span>
                <span className="text-body-sm text-text-secondary">{c.what}</span>
                <Keys keys={c.keys} />
              </span>
            </Item>
          ))}
        </Section>
      </div>

      {overview ? <ProjectEditor state={state} project={p} onClose={() => setOverview(false)} save={actions.save} /> : null}
      {editing ? (
        <ProjectItemEditor key={`${editing.kind}-${editing.id ?? 'new'}`} kind={editing.kind} id={editing.id} state={state} project={p} onClose={() => setEditing(null)} save={actions.save} />
      ) : null}
      {params.get('task') || params.get('new') ? (
        <TaskEditor
          key={params.get('task') ?? `new-${params.get('new') ?? ''}`}
          state={state}
          taskKey={params.get('task')}
          newProject={p.slug}
          onClose={closeEditor}
          save={actions.save}
        />
      ) : null}
    </div>
  )
}

function Overview({ project: p }: { project: Project }) {
  return (
    <div className="flex flex-col gap-stack-sm">
      <span className="flex flex-wrap items-baseline gap-x-inline-md gap-y-stack-xs text-body-sm text-text-secondary">
        <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        {p.phase ? <span>Phase: {p.phase}</span> : null}
        {p.owner ? <span>Owner: {p.owner}</span> : null}
      </span>
      {p.summary ? <Markdown>{p.summary}</Markdown> : <p className="text-body-sm text-text-muted">No summary yet.</p>}
      {p.currentFocus ? (
        <div className="flex flex-col gap-stack-xs border-s-(length:--border-width-md) border-accent-text ps-inline-md">
          <span className="text-label text-text-primary">Current focus</span>
          <div className="text-body-sm text-text-primary">
            <Markdown>{p.currentFocus}</Markdown>
          </div>
        </div>
      ) : null}
      {p.refs.length > 0 ? (
        <dl className="flex flex-col gap-stack-xs text-body-sm">
          {p.refs.map(r => (
            <div key={`${r.label}-${r.value}`} className="flex flex-wrap gap-x-inline-sm">
              <dt className="text-text-secondary">{r.label}</dt>
              <dd className="min-w-0 break-words text-text-primary">
                <Markdown inline>{r.value}</Markdown>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

/** Archived tasks by the sprint that closed them, newest first. */
function bySprint(tasks: readonly FoundTask[]): [number, FoundTask[]][] {
  const groups = new Map<number, FoundTask[]>()
  for (const t of tasks) groups.set(t.sprint ?? 0, [...(groups.get(t.sprint ?? 0) ?? []), t])
  return [...groups.entries()]
}

/** The project's tasks: open and finished ones open their editor; archived ones are a record. */
function Tasks({ tasks }: { tasks: ProjectView['tasks'] }) {
  const group = (id: string, label: string, items: ReactNode[]) =>
    items.length === 0
      ? []
      : [
          <li key={id} className="flex flex-col gap-stack-xs">
            <h3 className="text-heading-4 text-text-secondary">{label}</h3>
            <ul className="flex flex-col gap-stack-sm">{items}</ul>
          </li>,
        ]
  const line = (t: FoundTask) => (
    <TaskLine key={t.key} task={t} showProject={false}>
      <span>{t.statusName}</span>
    </TaskLine>
  )
  return (
    <Section id="tasks" title="Tasks" empty="No tasks in this project yet.">
      {[
        ...group('open', 'Open', tasks.open.map(line)),
        ...group('finished', 'Finished, still on the board', tasks.finished.map(line)),
        ...bySprint(tasks.archived).flatMap(([n, items]) =>
          group(`sprint-${n}`, `Archived in sprint ${n}`, items.map(t => (
            <li key={t.key} className="flex flex-wrap items-baseline gap-inline-sm">
              <KeyChip taskKey={t.key} />
              <span className="text-body-md text-text-primary">{t.title}</span>
              <Badge>{t.statusName}</Badge>
            </li>
          ))),
        ),
      ]}
    </Section>
  )
}
