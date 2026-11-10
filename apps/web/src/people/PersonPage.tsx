import { formatDay, personView, todayIn, type IsoDate, type PersonView, type WorkspaceState } from '@hecate/core'
import { Badge, Button, buttonStyles, ConfirmDialog, Dialog, EmptyState, Markdown } from '@hecate/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useApp } from '../appStore.ts'
import { ICON, Item, Section, TaskLine, TaskLink } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useActions } from '../useActions.ts'
import { useNow } from '../useNow.ts'
import { LeaveEditor, PersonEditor } from './editors.tsx'
import { isSanitised, removeLeaveOps, removePersonOps, restoreLeaveOps } from './people.ts'

const range = (r: { start: IsoDate; end: IsoDate }): string =>
  r.start === r.end ? formatDay(r.start) : `${formatDay(r.start)} – ${formatDay(r.end)}`

/**
 * One person and everything linked to them: tasks waiting on them, cutoffs
 * that name them, meetings that mention them, and their leave. Whether they
 * can be removed comes from person.remove itself (core's personView).
 * design/components/people-pages.md
 */
export function PersonPage() {
  const now = useNow()
  const { workspace = '', id = '' } = useParams()
  const label = useApp(s => {
    const p = s.open?.view?.people.people.find(x => x.id === id)
    return p ? (p.name ?? p.role) : null
  })
  const base = `/w/${encodeURIComponent(workspace)}`
  return (
    // Tasks open on the Board, as they do from Today and the Sprint.
    <TaskLink value={key => `${base}/board?task=${key}`}>
      <PageShell
        title={label ?? 'Person'}
        back={{ to: `${base}/people`, label: 'People' }}
        subtitle={snapshot => {
          const p = snapshot.state.people.people.find(x => x.id === id)
          return p?.name ? <p>{p.role}</p> : null
        }}
      >
        {snapshot => <Body state={snapshot.state} base={base} view={personView(snapshot.state, id, todayIn(snapshot.state.workspace.timezone, now))} />}
      </PageShell>
    </TaskLink>
  )
}

function Body({ state, base, view }: { state: WorkspaceState; base: string; view: PersonView | null }) {
  const actions = useActions()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [leave, setLeave] = useState<{ index: number | null } | null>(null)
  const [removing, setRemoving] = useState(false)

  if (!view) {
    return (
      <EmptyState title="No such person" action={<Link to={`${base}/people`} className={buttonStyles('secondary')}>Everyone</Link>}>
        There is no one with this address in this workspace. They may have been removed.
      </EmptyState>
    )
  }

  const p = view.person
  const who = p.name ?? p.role
  /** Leave as the person stores it, with each range's place in that list, shown in date order. */
  const ranges = p.ooo.map((r, index) => ({ ...r, index })).sort((a, b) => a.start.localeCompare(b.start))
  const today = view.leave

  return (
    <div className="grid gap-stack-lg lg:grid-cols-2">
      <div className="flex flex-col gap-stack-lg">
        <Section
          id="about"
          title="About"
          aside={
            <div className="flex flex-col gap-stack-sm">
              <span className="flex flex-wrap gap-x-inline-md text-body-sm text-text-secondary">
                <span>Role: {p.role}</span>
                {p.aliases.length > 0 ? <span>Also {p.aliases.join(', ')}</span> : null}
              </span>
              {p.notes ? <Markdown>{p.notes}</Markdown> : <p className="text-body-sm text-text-muted">No notes yet.</p>}
              {isSanitised(state) ? <p className="text-body-sm text-text-secondary">This workspace is sanitised: people are recorded by role, never by name.</p> : null}
            </div>
          }
          footer={
            <>
              <Button icon={<Pencil aria-hidden="true" className={ICON} />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button tone="danger" icon={<Trash2 aria-hidden="true" className={ICON} />} onClick={() => setRemoving(true)}>
                Remove {who}
              </Button>
            </>
          }
        >
          {[]}
        </Section>

        <Section
          id="leave"
          title="Leave"
          empty="No leave recorded."
          footer={
            <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={() => setLeave({ index: null })}>
              Add leave
            </Button>
          }
        >
          {ranges.map(r => {
            const shown = today.find(l => l.start === r.start && l.end === r.end)
            const name = `${range(r)}${r.note ? `: ${r.note}` : ''}`
            return (
              <Item
                key={`${r.start}-${r.end}-${r.index}`}
                name={name}
                onEdit={() => setLeave({ index: r.index })}
                onRemove={() =>
                  actions.change(removeLeaveOps(p, r.index), `Update ${who}'s leave`, { title: 'Removed leave', description: name, undo: restoreLeaveOps(p) })
                }
              >
                <span className="flex flex-wrap items-baseline gap-inline-sm">
                  <span className="text-body-md text-text-primary">{range(r)}</span>
                  {shown?.current ? <Badge tone="info">Away now</Badge> : null}
                  {shown?.past ? <Badge>Past</Badge> : null}
                  {r.note ? <span className="text-body-sm text-text-secondary">{r.note}</span> : null}
                </span>
              </Item>
            )
          })}
        </Section>
      </div>

      <div className="flex flex-col gap-stack-lg">
        <Section id="waiting" title="Waiting on them" empty="No open task waits on them.">
          {view.waitingOn.map(t => (
            <TaskLine key={t.key} task={t} />
          ))}
        </Section>
        <Section id="cutoffs" title="Cutoffs" empty="No project cutoff names them.">
          {view.cutoffs.map(c => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-inline-sm">
              <span className="text-label text-text-secondary">{formatDay(c.date)}</span>
              <span className="text-body-md text-text-primary">{c.what}</span>
              <Link to={`${base}/projects/${c.projectSlug}`} className="inline-flex min-h-(--size-target-default) items-center text-body-sm text-text-link underline">
                {c.projectName}
              </Link>
            </li>
          ))}
        </Section>
        <Section id="meetings" title="Meetings" empty="No meeting mentions them.">
          {view.meetings.map(m => (
            <li key={m.path} className="flex flex-wrap items-baseline gap-inline-sm">
              <span className="text-label text-text-secondary">{formatDay(m.date)}</span>
              <span className="text-body-md text-text-primary">{m.title}</span>
            </li>
          ))}
        </Section>
      </div>

      {editing ? <PersonEditor state={state} person={p} onClose={() => setEditing(false)} save={actions.save} /> : null}
      {leave ? <LeaveEditor key={leave.index ?? 'new'} person={p} index={leave.index} onClose={() => setLeave(null)} save={actions.save} /> : null}
      {view.removable.ok ? (
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={`Remove ${who}?`}
          description={`${who} is removed from People, with their notes and leave. Nothing else refers to them.`}
          confirmLabel={`Remove ${who}`}
          onConfirm={() => {
            if (actions.run(removePersonOps(p), `Remove ${who}`)) void navigate(`${base}/people`)
          }}
        />
      ) : (
        <Dialog open={removing} onOpenChange={setRemoving} title={`${who} is still linked`}>
          <p className="text-body-md text-text-secondary">
            {view.removable.reason}. Change those to someone else, or to text, then remove {who}.
          </p>
          <Button className="self-end" onClick={() => setRemoving(false)}>
            Close
          </Button>
        </Dialog>
      )}
    </div>
  )
}
