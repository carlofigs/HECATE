import {
  briefing, formatDay, PERSONAL_BLOCKED, type Briefing, type SprintPosition, type WorkspaceState,
} from '@hecate/core'
import { Badge, Button, ConfirmDialog, KeyChip, Markdown, type MenuItem } from '@hecate/ui'
import { CheckCheck, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { timeRange } from '../format.ts'
import { ICON, Item, Keys, Section, TaskLine, TaskLink, Urgency } from '../sections.tsx'
import { PageShell } from '../shell/PageShell.tsx'
import { useNow } from '../useNow.ts'
import { CloseDay } from './CloseDay.tsx'
import { canMove, itemName, listsOf, moveOps, removeOps, restoreOps, type ItemKind, type KeepItem, type ListKind, type Lists } from './focus.ts'
import { ItemEditor } from './ItemEditor.tsx'
import { useActions } from '../useActions.ts'

/**
 * Today: the same briefing Claude's get_briefing reads (@hecate/core
 * `briefing`), laid out for a glance. Nothing here derives a view of its own.
 * The plan, end of day, the week's priorities and callouts, and keep-in-mind
 * are edited here with the ops the hecate-focus skill sends (focus.ts); the
 * schedule stays Claude's, captured from the calendar.
 */
export function Today() {
  const now = useNow()
  const { workspace = '' } = useParams()
  const taskHref = (key: string): string => `/w/${encodeURIComponent(workspace)}/board?task=${key}`
  return (
    <TaskLink value={taskHref}>
      <PageShell title="Today" subtitle={snapshot => <Subtitle b={briefing(snapshot.state, now)} />}>
        {snapshot => <TodayBody state={snapshot.state} b={briefing(snapshot.state, now)} />}
      </PageShell>
    </TaskLink>
  )
}

function sprintText(s: SprintPosition): string {
  return [
    `Sprint ${s.n}`,
    `day ${s.day} of ${s.length}`,
    s.isLastDay ? 'closes today' : `closes ${formatDay(s.end)}`,
    ...(s.externalLabel ? [s.externalLabel] : []),
  ].join(' · ')
}

function Subtitle({ b }: { b: Briefing }) {
  return <p>{[b.todayLabel, ...(b.sprint ? [sprintText(b.sprint)] : [])].join(' · ')}</p>
}

const OUTCOME = { done: { tone: 'success', label: 'Done' }, carried: { tone: 'info', label: 'Carried' }, dropped: { tone: 'neutral', label: 'Dropped' } } as const
const TIERS = [['focus', 'Focus'], ['next', 'Next'], ['ongoing', 'Ongoing']] as const

/** What each list's changes are called: imperative for the store's "Couldn't …", past tense for the toast. */
const LIST_COPY: Record<ListKind, { remove: string; removed: string; reorder: string }> = {
  plan: { remove: "Remove from today's plan", removed: "Removed from today's plan", reorder: "Reorder today's plan" },
  priority: { remove: 'Remove a priority', removed: 'Removed a priority', reorder: "Reorder this week's priorities" },
  callout: { remove: 'Remove a callout', removed: 'Removed a callout', reorder: "Reorder this week's callouts" },
}

function TodayBody({ state, b }: { state: WorkspaceState; b: Briefing }) {
  const t = b.todayView
  const schedule = [...t.allDay, ...t.meetings]
  const lists: Lists = listsOf(b)
  const actions = useActions()
  const [editing, setEditing] = useState<{ kind: ItemKind; id: string | null } | null>(null)
  const [closing, setClosing] = useState(false)
  const [removing, setRemoving] = useState<KeepItem | null>(null)

  const edit = (kind: ItemKind, id: string | null = null) => () => setEditing({ kind, id })
  /** Move up, Move down and Remove for an item in one of the whole lists; each can be undone exactly. */
  const menu = (kind: ListKind, id: string, name: string): MenuItem[] => {
    const copy = LIST_COPY[kind]
    const move = (delta: -1 | 1) => () =>
      actions.change(moveOps(lists, kind, id, delta), copy.reorder, { title: delta < 0 ? 'Moved up' : 'Moved down', description: name, undo: restoreOps(lists, kind) })
    return [
      { label: 'Move up', onSelect: move(-1), disabled: !canMove(lists, kind, id, -1) },
      { label: 'Move down', onSelect: move(1), disabled: !canMove(lists, kind, id, 1) },
      { kind: 'separator' },
      { label: 'Remove', onSelect: () => actions.change(removeOps(lists, kind, id), copy.remove, { title: copy.removed, description: name, undo: restoreOps(lists, kind) }) },
    ]
  }

  return (
    <div className="grid gap-stack-lg lg:grid-cols-2">
      <div className="flex flex-col gap-stack-lg">
        <Section id="schedule" title="Schedule" empty="Nothing on the calendar today.">
          {schedule.map(r => (
            <li key={r.id} className="flex flex-col gap-stack-xs sm:flex-row sm:gap-inline-md">
              <span className="shrink-0 font-mono text-code text-text-secondary">{timeRange(r.start, r.end)}</span>
              <span className="flex flex-col gap-stack-xs">
                <span className="flex flex-wrap items-baseline gap-inline-sm">
                  <span className={r.personal ? 'text-body-md text-text-muted' : 'text-body-md text-text-primary'}>{r.personal ? PERSONAL_BLOCKED : r.title}</span>
                  {r.important ? <Badge tone="accent">Most important</Badge> : null}
                  {r.relevance === 'high' ? <Badge tone="warning">Needs prep</Badge> : null}
                  {r.relevance === 'med' ? <Badge tone="info">Useful context</Badge> : null}
                </span>
                {r.note ? <span className="text-body-sm text-text-secondary">{r.note}</span> : null}
                <Keys keys={r.keys} />
              </span>
            </li>
          ))}
        </Section>

        {t.closed ? (
          <Section
            id="outcomes"
            title="How today went"
            empty="The day was closed without outcomes."
            aside={t.note ? <div className="text-body-sm text-text-secondary"><Markdown>{t.note}</Markdown></div> : null}
            footer={
              <Button icon={<Pencil aria-hidden="true" className={ICON} />} onClick={() => setClosing(true)}>
                Edit how today went
              </Button>
            }
          >
            {t.outcomes.map(o => (
              <li key={o.id} className="flex flex-col gap-stack-xs">
                <span className="flex flex-wrap items-baseline gap-inline-sm">
                  <Badge tone={OUTCOME[o.result].tone}>{OUTCOME[o.result].label}</Badge>
                  <span className="text-body-md text-text-primary">{o.lead}</span>
                  <Keys keys={o.keys} />
                </span>
                {o.note ? <Markdown>{o.note}</Markdown> : null}
              </li>
            ))}
          </Section>
        ) : (
          <Section
            id="plan"
            title="Plan for today"
            empty="No plan for today yet. Add to it here, or ask Claude to draft one."
            footer={
              <>
                <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={edit('plan')}>
                  Add to plan
                </Button>
                <Button icon={<CheckCheck aria-hidden="true" className={ICON} />} onClick={() => setClosing(true)}>
                  Close the day
                </Button>
              </>
            }
          >
            {t.plan.map(p => (
              <Item key={p.id} name={p.lead} onEdit={edit('plan', p.id)} menu={menu('plan', p.id, p.lead)}>
                <span className="flex flex-wrap items-baseline gap-inline-sm">
                  <span className="text-label text-text-primary">{p.lead}</span>
                  <Urgency urgency={p.urgency} />
                  <Keys keys={p.keys} />
                </span>
                {p.detail ? <div className="text-body-sm text-text-secondary"><Markdown>{p.detail}</Markdown></div> : null}
              </Item>
            ))}
          </Section>
        )}

        <Section
          id="week"
          title="This week"
          empty="No priorities set for this week."
          footer={
            <>
              <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={edit('priority')}>
                Add a priority
              </Button>
              <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={edit('callout')}>
                Add a callout
              </Button>
            </>
          }
        >
          {[
            ...b.week.callouts.map(c => (
              <Item
                key={c.id}
                name={itemName(c)}
                onEdit={edit('callout', c.id)}
                menu={menu('callout', c.id, itemName(c))}
                className="border-s-(length:--border-width-md) border-accent-text ps-inline-md"
              >
                <p className="text-body-sm text-text-primary">
                  {c.lead ? <span className="text-label">{c.lead} </span> : null}
                  <Markdown inline>{c.text}</Markdown>
                </p>
              </Item>
            )),
            ...TIERS.flatMap(([tier, label]) => {
              const items = b.week.priorities.filter(p => p.tier === tier)
              return items.length === 0
                ? []
                : [
                    <li key={tier} className="flex flex-col gap-stack-xs">
                      <h3 className="text-heading-4 text-text-secondary">{label}</h3>
                      <ul className="flex flex-col gap-stack-xs">
                        {items.map(p => (
                          <Item key={p.id} name={p.lead} onEdit={edit('priority', p.id)} menu={menu('priority', p.id, p.lead)}>
                            <span className="flex flex-wrap items-baseline gap-inline-sm">
                              <span className="text-body-md text-text-primary">{p.lead}</span>
                              <Keys keys={p.keys} />
                            </span>
                            {p.detail ? <div className="text-body-sm text-text-secondary"><Markdown>{p.detail}</Markdown></div> : null}
                          </Item>
                        ))}
                      </ul>
                    </li>,
                  ]
            }),
          ]}
        </Section>
      </div>

      <div className="flex flex-col gap-stack-lg">
        <Section id="in-progress" title="In progress" empty="Nothing is in progress.">
          {b.inProgress.map(s => <TaskLine key={s.key} task={s} />)}
        </Section>

        <Section id="waiting-on" title="Waiting on" empty="You aren't waiting on anyone.">
          {b.waitingOn.map(w => (
            <TaskLine key={w.key} task={w}>
              {w.who ? <span>From {w.who}</span> : null}
              {w.meeting ? <span>Next: {w.meeting}</span> : null}
              {w.unblocks.length > 0 ? <span>Unblocks {w.unblocks.map(u => u.key).join(', ')}</span> : null}
            </TaskLine>
          ))}
        </Section>

        <Section id="blocked" title="Blocked" empty="Nothing is blocked.">
          {b.blocked.map(s => <TaskLine key={s.key} task={s} />)}
        </Section>

        <Section id="due-soon" title="Due soon" empty="Nothing is due in the next two weeks.">
          {b.dueSoon.map(d => (
            <li key={`${d.kind}-${d.key ?? d.title}-${d.date}`} className="flex flex-wrap items-baseline gap-inline-sm">
              <span className="text-label text-text-secondary">{formatDay(d.date)}</span>
              {d.overdue ? <Badge tone="danger">Overdue</Badge> : null}
              {d.key ? <KeyChip taskKey={d.key} /> : null}
              <span className="text-body-md text-text-primary">{d.title}</span>
              {d.hard ? <Badge tone="warning">Hard deadline</Badge> : null}
              {d.projectSlug ? <span className="text-body-sm text-text-secondary">Project {d.projectSlug}</span> : null}
            </li>
          ))}
        </Section>

        <Section id="cutoffs" title="Cutoffs and leave" empty="No cutoffs or leave in the next two weeks.">
          {b.cutoffs.map(c => (
            <li key={`${c.kind}-${c.start}-${c.who}`} className="flex flex-wrap items-baseline gap-inline-sm">
              <span className="text-label text-text-secondary">{c.kind === 'ooo' ? `${formatDay(c.start)} – ${formatDay(c.end)}` : formatDay(c.start)}</span>
              <Badge tone={c.kind === 'ooo' ? 'info' : 'warning'}>{c.kind === 'ooo' ? 'Leave' : 'Cutoff'}</Badge>
              <span className="text-body-md text-text-primary">{c.who}</span>
              {c.what ? <span className="text-body-sm text-text-secondary">{c.what}</span> : null}
            </li>
          ))}
        </Section>

        <Section
          id="keep-in-mind"
          title="Keep in mind"
          empty="Nothing to keep in mind."
          footer={
            <Button variant="ghost" icon={<Plus aria-hidden="true" className={ICON} />} onClick={edit('keep')}>
              Add to keep in mind
            </Button>
          }
        >
          {b.keepInMind.map(k => (
            <Item key={k.id} name={itemName(k)} onEdit={edit('keep', k.id)} onRemove={() => setRemoving(k)} className="text-body-sm text-text-primary">
              {k.lead ? <span className="text-label">{k.lead}</span> : null}
              <Markdown>{k.text}</Markdown>
            </Item>
          ))}
        </Section>
      </div>

      {editing ? (
        <ItemEditor key={`${editing.kind}-${editing.id ?? 'new'}`} kind={editing.kind} id={editing.id} state={state} lists={lists} onClose={() => setEditing(null)} save={actions.save} />
      ) : null}
      {closing ? <CloseDay state={state} view={t} onClose={() => setClosing(false)} save={actions.save} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove this from keep in mind?"
        description={removing ? `“${itemName(removing)}” is removed. Add it again if you still need it.` : ''}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) actions.change(removeOps(lists, 'keep', removing.id), 'Remove from keep in mind', { title: 'Removed from keep in mind', description: itemName(removing) })
          setRemoving(null)
        }}
      />
    </div>
  )
}
