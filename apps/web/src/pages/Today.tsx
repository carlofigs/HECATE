import {
  briefing, formatDay, PERSONAL_BLOCKED, type Briefing, type SprintPosition, type TaskSummary,
} from '@hecate/core'
import { Badge, KeyChip, Markdown, cn } from '@hecate/ui'
import { createContext, use, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { timeRange, URGENCY_LABEL, URGENCY_TONE } from '../format.ts'
import { PageShell } from '../shell/PageShell.tsx'
import { useNow } from '../useNow.ts'

/**
 * Today, read-only: the same briefing Claude's get_briefing reads
 * (@hecate/core `briefing`), laid out for a glance. Nothing here derives a
 * view of its own.
 */
/**
 * Where a task opens: the Board's editor for it. A task's title is the link;
 * key chips stay labels, being too small a target (R-07).
 */
const TaskLink = createContext<(key: string) => string>(key => `?task=${key}`)


export function Today() {
  const now = useNow()
  const { workspace = '' } = useParams()
  const taskHref = (key: string): string => `/w/${encodeURIComponent(workspace)}/board?task=${key}`
  return (
    <TaskLink value={taskHref}>
      <PageShell title="Today" subtitle={snapshot => <Subtitle b={briefing(snapshot.state, now)} />}>
        {snapshot => <TodayBody b={briefing(snapshot.state, now)} />}
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

function Section({ id, title, empty, children, className }: { id: string; title: string; empty: string; children: ReactNode[]; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-stack-sm rounded-container border border-border-subtle bg-bg-surface p-inset-lg', className)}>
      <h2 id={id} className="text-heading-3 text-text-primary">
        {title}
      </h2>
      {children.length > 0 ? <ul className="flex flex-col gap-stack-sm">{children}</ul> : <p className="text-body-sm text-text-muted">{empty}</p>}
    </section>
  )
}

const Keys = ({ keys }: { keys: readonly string[] }) =>
  keys.length > 0 ? (
    <span className="inline-flex flex-wrap gap-inline-xs">
      {keys.map(k => (
        <KeyChip key={k} taskKey={k} />
      ))}
    </span>
  ) : null

function Urgency({ urgency }: { urgency: TaskSummary['urgency'] }) {
  return urgency ? <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge> : null
}

/** A task line: key, title, then the facts that decide what to do with it. */
function TaskLine({ task, children }: { task: TaskSummary; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-stack-xs">
      <span className="flex flex-wrap items-baseline gap-inline-sm">
        <KeyChip taskKey={task.key} />
        <Link to={use(TaskLink)(task.key)} className="inline-flex min-h-(--size-target-default) items-center text-body-md text-text-link underline">
          {task.title}
        </Link>
        <Urgency urgency={task.urgency} />
      </span>
      <span className="flex flex-wrap gap-x-inline-md text-body-sm text-text-secondary">
        {task.blockedBy.length > 0 ? <span>Blocked by {task.blockedBy.join(', ')}</span> : null}
        {task.due ? <span>Due {formatDay(task.due)}</span> : null}
        {task.projectSlug ? <span>Project {task.projectSlug}</span> : null}
        {children}
      </span>
    </li>
  )
}

const OUTCOME = { done: { tone: 'success', label: 'Done' }, carried: { tone: 'info', label: 'Carried' }, dropped: { tone: 'neutral', label: 'Dropped' } } as const
const TIERS = [['focus', 'Focus'], ['next', 'Next'], ['ongoing', 'Ongoing']] as const

function TodayBody({ b }: { b: Briefing }) {
  const t = b.todayView
  const schedule = [...t.allDay, ...t.meetings]

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
          <Section id="outcomes" title="How today went" empty="The day was closed without outcomes.">
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
          <Section id="plan" title="Plan for today" empty="No plan for today yet. Ask Claude to draft one with the hecate-focus skill.">
            {t.plan.map(p => (
              <li key={p.id} className="flex flex-col gap-stack-xs">
                <span className="flex flex-wrap items-baseline gap-inline-sm">
                  <span className="text-label text-text-primary">{p.lead}</span>
                  <Urgency urgency={p.urgency} />
                  <Keys keys={p.keys} />
                </span>
                {p.detail ? <div className="text-body-sm text-text-secondary"><Markdown>{p.detail}</Markdown></div> : null}
              </li>
            ))}
          </Section>
        )}

        <Section id="week" title="This week" empty="No priorities set for this week.">
          {[
            ...b.week.callouts.map(c => (
              <li key={c.id} className="border-s-(length:--border-width-md) border-accent-text ps-inline-md text-body-sm text-text-primary">
                {c.lead ? <span className="text-label">{c.lead} </span> : null}
                <Markdown inline>{c.text}</Markdown>
              </li>
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
                          <li key={p.id} className="flex flex-col gap-stack-xs">
                            <span className="flex flex-wrap items-baseline gap-inline-sm">
                              <span className="text-body-md text-text-primary">{p.lead}</span>
                              <Keys keys={p.keys} />
                            </span>
                            {p.detail ? <div className="text-body-sm text-text-secondary"><Markdown>{p.detail}</Markdown></div> : null}
                          </li>
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

        <Section id="keep-in-mind" title="Keep in mind" empty="Nothing to keep in mind.">
          {b.keepInMind.map(k => (
            <li key={k.id} className="flex flex-col gap-stack-xs text-body-sm text-text-primary">
              {k.lead ? <span className="text-label">{k.lead}</span> : null}
              <Markdown>{k.text}</Markdown>
            </li>
          ))}
        </Section>
      </div>
    </div>
  )
}
