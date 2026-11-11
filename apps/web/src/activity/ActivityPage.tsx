import { formatDay, type WorkspaceState } from '@hecate/core'
import { Badge, Banner, Button, Dialog, EmptyState, KeyChip, RadioGroupField, SelectField, Skeleton, TextField, cn } from '@hecate/ui'
import { CheckCheck, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router'
import { api, appStore, useApp } from '../appStore.ts'
import type { ActivityEntry, ActivityPage as Page, Outcome } from '../api.ts'
import { FormProblems } from '../FormProblems.tsx'
import { ICON, Section } from '../sections.tsx'
import { describeFailure } from '../shell/failure.ts'
import { PageShell } from '../shell/PageShell.tsx'
import { useBottomActionSlot } from '../shell/slots.ts'
import type { LocalResult } from '../store.ts'
import { pushToast } from '../toasts.ts'
import { useActions } from '../useActions.ts'
import { ACTOR_LABEL, byDay, emptyLogForm, isNew, logOps, merged, timeOf, TYPE_LABEL, validateLog, type LogForm } from './feed.ts'

interface Feed {
  /** The newest page, reloaded whenever the workspace changes. */
  first: Outcome<Page> | null
  /** Older pages loaded on request; the log is append-only, so they stay valid. */
  older: ActivityEntry[]
  moreOlder: boolean | null
}

/**
 * The activity log through the app's own reader (ADR 0002): its pages, and marking them read. It reloads when the
 * workspace changes, or when the count of new entries does (Mark all as read in another tab).
 */
function useActivity(dir: string, version: number | null, unread: number | null) {
  const [feed, setFeed] = useState<Feed>({ first: null, older: [], moreOlder: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (version === null) return
    let current = true
    void api.activity(dir).then(first => {
      if (current) setFeed(f => ({ ...f, first }))
    })
    return () => {
      current = false
    }
  }, [dir, version, unread, tick])

  const page = feed.first?.kind === 'ok' ? feed.first.data : null
  const entries = page ? merged(page.entries, feed.older) : []
  return {
    feed,
    page,
    entries,
    more: feed.moreOlder ?? page?.more ?? false,
    reload: () => setTick(t => t + 1),
    loadOlder: async (): Promise<void> => {
      const last = entries.at(-1)
      if (!last) return
      const older = await api.activity(dir, { before: last.id })
      if (older.kind === 'ok') setFeed(f => ({ ...f, older: merged(f.older, older.data.entries), moreOlder: older.data.more }))
      else pushToast({ tone: 'danger', title: "Couldn't load older activity", description: describeFailure(older, 'the activity log').title })
    },
    markRead: async (): Promise<void> => {
      const result = await api.ackActivity(dir)
      if (result.kind !== 'ok') {
        pushToast({ tone: 'danger', title: "Couldn't mark activity as read", description: describeFailure(result, 'the activity log').title })
        return
      }
      setTick(t => t + 1)
      void appStore.getState().refresh()
    },
  }
}

/**
 * What changed in the workspace, newest first: Claude's notes and sessions,
 * imports, and every task added, finished or archived. Entries since you last
 * looked are marked New; your own changes never are. design/components/activity-page.md
 */
export function ActivityPage() {
  const { workspace = '' } = useParams()
  const version = useApp(s => s.open?.snapshot?.version ?? null)
  const unreadNow = useApp(s => s.open?.snapshot?.activity?.unread ?? null)
  const activity = useActivity(workspace, version, unreadNow)
  const actions = useActions()
  const slot = useBottomActionSlot()
  const [adding, setAdding] = useState(false)
  const unread = activity.page?.unread ?? 0

  const [marking, setMarking] = useState(false)
  const markRead = (
    <Button
      variant="primary"
      icon={<CheckCheck aria-hidden="true" className={ICON} />}
      aria-disabled={marking || undefined}
      onClick={() => {
        if (marking) return
        setMarking(true)
        void activity.markRead().finally(() => setMarking(false))
      }}
    >
      {marking ? 'Marking as read…' : 'Mark all as read'}
    </Button>
  )
  return (
    <>
      <PageShell
        title="Activity"
        subtitle={() => (activity.page ? <p>{unread > 0 ? `${unread} new since you last looked` : 'Nothing new since you last looked'}</p> : null)}
        actions={unread > 0 ? <div className="max-md:hidden">{markRead}</div> : undefined}
      >
        {snapshot => (
          <>
            <Body state={snapshot.state} activity={activity} onAdd={() => setAdding(true)} />
            {adding ? <LogEditor state={snapshot.state} onClose={() => setAdding(false)} save={actions.save} /> : null}
          </>
        )}
      </PageShell>
      {slot && unread > 0 ? createPortal(markRead, slot) : null}
    </>
  )
}

function Body({ state, activity, onAdd }: { state: WorkspaceState; activity: ReturnType<typeof useActivity>; onAdd: () => void }) {
  const [loadingOlder, setLoadingOlder] = useState(false)
  const first = activity.feed.first
  if (!first) {
    return (
      <div aria-busy="true" className="flex flex-col gap-stack-lg">
        <Skeleton lines={4} />
      </div>
    )
  }
  if (first.kind !== 'ok') {
    const f = describeFailure(first, 'the activity log')
    return (
      <Banner tone="danger" title={f.title} action={<Button onClick={activity.reload}>Try again</Button>}>
        {f.detail}
      </Banner>
    )
  }
  if (activity.entries.length === 0) {
    return (
      <EmptyState title="Nothing has happened here yet" action={<Button onClick={onAdd}>Add to log</Button>}>
        Tasks added and finished, sprints closed, and notes from you or Claude appear here.
      </EmptyState>
    )
  }
  const cursor = first.data.cursor
  const tz = state.workspace.timezone
  return (
    <div className="flex flex-col gap-stack-lg">
      {/* At every width: on a phone the bottom bar holds Mark all as read. */}
      <Button className="self-start" icon={<Plus aria-hidden="true" className={ICON} />} onClick={onAdd}>
        Add to log
      </Button>
      {byDay(activity.entries).map(day => (
        <Section key={day.date} id={`day-${day.date}`} title={formatDay(day.date)}>
          {day.entries.map(e => <Entry key={e.id} entry={e} fresh={isNew(e, cursor)} timezone={tz} />)}
        </Section>
      ))}
      {activity.more ? (
        <Button
          className="self-start"
          disabled={loadingOlder}
          onClick={() => {
            setLoadingOlder(true)
            void activity.loadOlder().finally(() => setLoadingOlder(false))
          }}
        >
          {loadingOlder ? 'Loading…' : 'Load older'}
        </Button>
      ) : null}
    </div>
  )
}

function Entry({ entry, fresh, timezone }: { entry: ActivityEntry; fresh: boolean; timezone: string }) {
  return (
    <li className={cn('flex flex-col gap-stack-xs', fresh ? 'border-s-(length:--border-width-md) border-accent-text ps-inline-md' : '')}>
      <span className="flex flex-wrap items-baseline gap-inline-sm text-body-sm text-text-secondary">
        <span className="font-mono">{timeOf(entry.at, timezone)}</span>
        <Badge>{ACTOR_LABEL[entry.actor]}</Badge>
        <Badge tone={entry.type === 'flag' ? 'warning' : entry.type === 'session' ? 'info' : 'neutral'}>{TYPE_LABEL[entry.type]}</Badge>
        {entry.area ? <span>{entry.area}</span> : null}
        {fresh ? <Badge tone="accent">New</Badge> : null}
      </span>
      <span className="flex flex-wrap items-baseline gap-inline-sm">
        <span className="text-body-md text-text-primary">{entry.delta}</span>
        {entry.keys.map(k => <KeyChip key={k} taskKey={k} />)}
      </span>
    </li>
  )
}

const KINDS = [{ value: 'flag', label: 'Flag: something to remember' }, { value: 'session', label: 'Session: work done' }] as const

/** A note in the log: one activity.log op, as the hecate-log skill sends. design/components/activity-page.md */
function LogEditor({ state, onClose, save }: { state: WorkspaceState; onClose: () => void; save: (ops: unknown[], label: string) => LocalResult }) {
  const [form, setForm] = useState<LogForm>(emptyLogForm)
  const [touched, setTouched] = useState<ReadonlySet<keyof LogForm>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const summary = useRef<HTMLDivElement>(null)
  const errors = validateLog(state, form)
  const problems = Object.values(errors)
  const errorFor = (field: keyof LogForm): string | undefined => (submitted || touched.has(field) ? errors[field] : undefined)
  const set = <K extends keyof LogForm>(field: K, value: LogForm[K]): void => setForm(f => ({ ...f, [field]: value }))
  const blur = (field: keyof LogForm) => () => setTouched(t => new Set(t).add(field))

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (problems.length > 0) {
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const result = save(logOps(form), 'Add to the log')
    if (!result.ok) {
      setSaveError(`${result.message}. Nothing was changed; correct it and save again.`)
      return
    }
    pushToast({ tone: 'success', title: 'Added to the log', description: form.text.trim() })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()} title="Add to the log">
      <form noValidate onSubmit={submit} className="flex flex-col gap-stack-md">
        {submitted && problems.length > 0 ? <FormProblems ref={summary} problems={problems} /> : null}
        {saveError ? <Banner tone="danger" title="Not saved">{saveError}</Banner> : null}
        <RadioGroupField legend="Kind" name="log-kind" value={form.kind} options={KINDS} onChange={v => set('kind', v as LogForm['kind'])} />
        <TextField label="What happened" required hint="One line, up to 200 characters" value={form.text} error={errorFor('text')} onChange={e => set('text', e.target.value)} onBlur={blur('text')} />
        {state.workspace.areas.length > 0 ? (
          <SelectField label="Area" value={form.area} options={[{ value: '', label: 'None' }, ...state.workspace.areas.map(a => ({ value: a.id, label: a.label }))]} onChange={e => set('area', e.target.value)} />
        ) : null}
        <TextField label="Tasks" hint="Task keys, such as A12, B3" value={form.keys} error={errorFor('keys')} onChange={e => set('keys', e.target.value)} onBlur={blur('keys')} />
        <div className="flex flex-col-reverse gap-stack-sm md:flex-row md:justify-end md:gap-inline-sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Add to log
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
