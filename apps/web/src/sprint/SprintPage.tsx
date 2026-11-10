import { formatDay, sprintList, sprintPosition, sprintView, todayIn, type SprintSummary, type SprintView, type TaskSummary, type WorkspaceState } from '@hecate/core'
import { Badge, Button, buttonStyles, EmptyState, KeyChip, Markdown } from '@hecate/ui'
import { CheckCheck, Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router'
import { useApp } from '../appStore.ts'
import { ICON, Section, TaskLine, TaskLink } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import { useActions } from '../useActions.ts'
import { useNow } from '../useNow.ts'
import { CloseSprint } from './CloseSprint.tsx'
import { tally, type TextKind } from './sprint.ts'
import { SprintText } from './SprintText.tsx'

const range = (s: { start: SprintSummary['start']; end: SprintSummary['end'] }): string => `${formatDay(s.start)} – ${formatDay(s.end)}`

/** The sprint the page is about: the one in the address, or today's. */
function useSprint(): { state: WorkspaceState | null; n: number | null; view: SprintView | null; now: Date } {
  const now = useNow()
  const { n: param } = useParams()
  const state = useApp(s => s.open?.view ?? null)
  const n = param !== undefined ? (/^-?\d+$/.test(param) ? Number(param) : null) : state ? (sprintPosition(state, todayIn(state.workspace.timezone, now))?.n ?? null) : null
  return { state, n, view: state && n !== null ? sprintView(state, n, now) : null, now }
}

/**
 * A sprint: its goal and retro, what closing it archives and carries (or did),
 * and every other sprint. The current one can be reviewed and closed here.
 * design/components/sprint-page.md
 */
export function SprintPage() {
  const { workspace = '', n: param } = useParams()
  const { n, view, now } = useSprint()
  const slot = useBottomActionSlot()
  const actions = useActions()
  const [closing, setClosing] = useState(false)
  const base = `/w/${encodeURIComponent(workspace)}`
  const canClose = view?.closable?.ok === true

  const review = (
    <Button variant="primary" icon={<CheckCheck aria-hidden="true" className={ICON} />} onClick={() => setClosing(true)}>
      Review and close
    </Button>
  )
  return (
    // Open tasks open on the Board, as they do from Today.
    <TaskLink value={key => `${base}/board?task=${key}`}>
      <PageShell
        title={n === null ? 'Sprint' : `Sprint ${n}`}
        {...(param !== undefined && view && !view.current ? { back: { to: `${base}/sprint`, label: 'Current sprint' } } : {})}
        subtitle={snapshot => (view ? <p>{subtitle(snapshot.state, view)}</p> : null)}
        actions={canClose ? <div className="max-md:hidden">{review}</div> : undefined}
      >
        {snapshot => (
          <SprintBody state={snapshot.state} n={n} view={view} base={base} now={now} />
        )}
      </PageShell>
      {slot && canClose ? createPortal(review, slot) : null}
      {closing && view ? <CloseSprint view={view} onClose={() => setClosing(false)} save={actions.save} /> : null}
    </TaskLink>
  )
}

function subtitle(state: WorkspaceState, view: SprintView): string {
  if (view.closedAt) return `${range(view)} · Closed ${formatDay(todayIn(state.workspace.timezone, new Date(Date.parse(view.closedAt))))}`
  const p = view.position
  if (p) return `${range(view)} · day ${p.day} of ${p.length} · ${p.isLastDay ? 'closes today' : `closes ${formatDay(p.end)}`}`
  return `${range(view)} · Not closed`
}

function SprintBody({ state, n, view, base, now }: { state: WorkspaceState; n: number | null; view: SprintView | null; base: string; now: Date }) {
  const actions = useActions()
  const [editing, setEditing] = useState<TextKind | null>(null)

  if (!view) {
    return n === null || !state.workspace.sprint ? (
      <EmptyState title="This workspace has no sprints">
        Sprints come from the workspace's cadence, such as two weeks starting on a Wednesday. Ask Claude to set one.
      </EmptyState>
    ) : (
      <EmptyState title={`No sprint ${n}`} action={<Link to={`${base}/sprint`} className={buttonStyles('secondary')}>Current sprint</Link>}>
        There is no sprint with that number in this workspace.
      </EmptyState>
    )
  }

  const text = (kind: TextKind, title: string, empty: string) => (
    <Section
      id={kind}
      title={title}
      aside={view[kind] ? <Markdown>{view[kind]}</Markdown> : <p className="text-body-sm text-text-muted">{empty}</p>}
      footer={
        <Button icon={<Pencil aria-hidden="true" className={ICON} />} onClick={() => setEditing(kind)}>
          {view[kind] ? `Edit ${kind}` : kind === 'goal' ? 'Set the goal' : 'Write the retro'}
        </Button>
      }
    >
      {[]}
    </Section>
  )

  return (
    <div className="grid gap-stack-lg lg:grid-cols-2">
      <div className="flex flex-col gap-stack-lg">
        {text('goal', 'Goal', 'No goal set.')}
        {text('retro', 'Retro', view.closed ? 'No retro was written.' : 'No retro yet.')}
        {view.sections.map(section => (
          <Section key={section.id} id={`section-${section.id}`} title={section.title} aside={<Markdown>{section.content}</Markdown>}>
            {[]}
          </Section>
        ))}
      </div>
      <div className="flex flex-col gap-stack-lg">
        <Tasks view={view} />
        <AllSprints rows={sprintList(state, todayIn(state.workspace.timezone, now))} viewing={view.n} base={base} />
      </div>
      {editing ? <SprintText view={view} kind={editing} onClose={() => setEditing(null)} save={actions.save} /> : null}
    </div>
  )
}

/** A task the sprint archived: a record, so not a link. */
const Archived = ({ task, status }: { task: TaskSummary; status?: string }) => (
  <li className="flex flex-wrap items-baseline gap-inline-sm">
    <KeyChip taskKey={task.key} />
    <span className="text-body-md text-text-primary">{task.title}</span>
    {status ? <Badge>{status}</Badge> : null}
  </li>
)

function Tasks({ view }: { view: SprintView }) {
  const group = (id: string, label: string, items: ReactNode[]) =>
    items.length === 0
      ? []
      : [
          <li key={id} className="flex flex-col gap-stack-xs">
            <h3 className="text-heading-4 text-text-secondary">{label} ({items.length})</h3>
            <ul className="flex flex-col gap-stack-sm">{items}</ul>
          </li>,
        ]
  const children = view.closed
    ? [
        ...group('done', 'Done', view.done.map(t => <Archived key={t.key} task={t} />)),
        ...group('dropped', 'Dropped', view.dropped.map(t => <Archived key={t.key} task={t} />)),
        ...group('carried', 'Carried', view.carried.map(t => <Archived key={t.key} task={t} status={t.statusName} />)),
      ]
    : [
        ...group('done', 'Done: moves to the archive at close', view.done.map(t => <TaskLine key={t.key} task={t} />)),
        ...group('dropped', 'Dropped: moves to the archive at close', view.dropped.map(t => <TaskLine key={t.key} task={t} />)),
        ...group('carried', 'In progress: carried at close', view.carried.map(t => <TaskLine key={t.key} task={t} />)),
      ]
  return (
    <Section id="tasks" title="Tasks" empty={view.closed ? 'Nothing was archived or carried.' : 'Nothing is finished or in progress yet.'}>
      {children}
    </Section>
  )
}

function AllSprints({ rows, viewing, base }: { rows: SprintSummary[]; viewing: number; base: string }) {
  return (
    <Section id="sprints" title="All sprints" empty="No sprints yet.">
      {rows.map(r => (
        <li key={r.n} className="flex flex-col gap-stack-xs">
          <span className="flex flex-wrap items-baseline gap-inline-sm">
            {r.n === viewing ? (
              <span className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-primary">Sprint {r.n} (this page)</span>
            ) : (
              <Link to={r.current ? `${base}/sprint` : `${base}/sprint/${r.n}`} className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-link underline">
                Sprint {r.n}
              </Link>
            )}
            {r.current ? <Badge tone="accent">Current</Badge> : null}
            {r.legacy ? <Badge>From v1</Badge> : null}
          </span>
          <span className="flex flex-wrap gap-x-inline-md text-body-sm text-text-secondary">
            <span>{range(r)}</span>
            <span>{r.velocity ? tally(r.velocity) : r.closed ? 'Closed' : 'Not closed'}</span>
          </span>
        </li>
      ))}
    </Section>
  )
}
