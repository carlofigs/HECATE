/**
 * The e2e data: two workspaces built through @hecate/core's own ops, so they
 * are exactly what the app and Claude would write. Generic names only — this
 * repository is public.
 *
 * Pinned to Wednesday 11 November 2026, 09:00 in Sydney: sprint 7 runs from
 * Wednesday 4 November, so this is its day 8 of 14.
 */
import { applyBatch, createUlid, CURRENT_VERSION, emptyState, filesFromState, parseFile, prepareBatch } from '@hecate/core'

/** The moment every e2e page is pinned to. */
export const NOW = new Date('2026-11-10T22:00:00.000Z')
const AT = '2026-11-09T21:00:00.000Z'
const WEEK = '2026-11-09'
const TODAY = '2026-11-11'

const STATUSES = [
  { id: 'backlog', name: 'Backlog', category: 'backlog' },
  { id: 'to-do', name: 'To Do', category: 'todo' },
  { id: 'in-progress', name: 'In Progress', category: 'active' },
  { id: 'done', name: 'Done', category: 'done' },
  { id: 'not-doing', name: 'Not Doing', category: 'dropped' },
]

function build(settings: { name: string; sprint: unknown }, ops: unknown[]): Record<string, string> {
  const workspace = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: settings.name, timezone: 'Australia/Sydney', policy: 'open',
    workdays: [1, 2, 3, 4, 5], sprint: settings.sprint, statuses: STATUSES, tags: [], areas: [],
  })
  const batch = prepareBatch({ ops }, { opId: `seed-${settings.name}`, at: AT, actor: 'import', newId: createUlid({ now: () => Date.parse(AT) }) })
  const result = applyBatch(emptyState(workspace, AT), batch)
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2))
  return filesFromState(result.state)
}

/** "Planning": everything Today can show. A1–A6, B1. */
function planning(): Record<string, string> {
  return build({ name: 'Planning', sprint: { anchor: '2026-11-04', anchorNumber: 7, lengthWeeks: 2, external: null } }, [
    { type: 'person.upsert', name: 'Alex', role: 'Data engineer', ooo: [{ start: '2026-11-16', end: '2026-11-18', note: 'Conference' }] },
    { type: 'person.upsert', name: 'Sam', role: 'Product manager' },
    {
      type: 'project.create', slug: 'scorecard', name: 'Scorecard', status: 'active',
      deadlines: [{ date: '2026-11-13', title: 'Scorecard review', hard: true }],
      cutoffs: [{ date: '2026-11-19', who: 'Finance team', what: 'Month-end close' }],
    },
    { type: 'task.add', ref: '$1', kind: 'action', title: 'Draft the scorecard', status: 'in-progress', urgency: 'high', project: 'scorecard', due: '2026-11-12', tags: ['reporting'] },
    { type: 'task.add', ref: '$2', kind: 'action', title: 'Publish the scorecard', urgency: 'med', project: 'scorecard', dependsOn: ['$1', '$3'] },
    { type: 'task.add', ref: '$3', kind: 'waiting', title: 'Targets from finance', urgency: 'high', waitingOn: { text: 'Finance team' } },
    { type: 'task.add', ref: '$4', kind: 'action', title: 'Tidy the backlog', status: 'backlog', urgency: 'low' },
    { type: 'task.add', ref: '$5', kind: 'action', title: 'Review the dashboard', status: 'done' },
    { type: 'task.add', ref: '$6', kind: 'action', title: 'Plan the team offsite', status: 'in-progress', due: '2026-11-10' },
    {
      type: 'focus.setSchedule', weekOf: WEEK,
      rows: [
        { date: TODAY, start: null, end: null, title: 'Office closes early' },
        { date: TODAY, start: '09:30', end: '10:00', title: 'Stand-up' },
        { date: TODAY, start: '13:30', end: '14:30', title: 'Scorecard review', relevance: 'high', important: true, keys: ['$1'] },
        { date: TODAY, start: '16:00', end: '17:00', personal: true },
        { date: '2026-11-12', start: '11:00', end: '11:30', title: 'Finance sync', relevance: 'med', keys: ['$3'] },
      ],
    },
    {
      type: 'focus.setPlan', date: TODAY,
      items: [
        { lead: 'Finish the scorecard draft', detail: 'Check the numbers against B1 before the review.', urgency: 'high', keys: ['$1'] },
        { lead: 'Clear the inbox', urgency: 'low' },
      ],
    },
    {
      type: 'focus.setPriorities', weekOf: WEEK,
      items: [
        { tier: 'focus', lead: 'Ship the scorecard', detail: 'The review on Friday decides the **launch date**.', keys: ['$1', '$2'] },
        { tier: 'next', lead: 'Plan the offsite', keys: ['$6'] },
        { tier: 'ongoing', lead: 'Keep the backlog tidy' },
      ],
    },
    { type: 'focus.setCallouts', weekOf: WEEK, items: [{ lead: 'Sprint review on Tuesday.', text: 'Bring the scorecard numbers.' }] },
    { type: 'keepInMind.add', lead: 'Leave', text: 'Alex is away 16–18 November: hand over A1 before then.' },
  ])
}

/** "Club": a workspace with tasks but no plan, schedule or sprint, for Today's empty states. */
function club(): Record<string, string> {
  return build({ name: 'Club', sprint: null }, [{ type: 'task.add', kind: 'action', title: 'Book the hall', status: 'backlog' }])
}

const under = (dir: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]))

/** The data repository's files: README plus both workspaces. */
export function fixtureFiles(): Record<string, string> {
  return { 'README.md': '# Data\n', ...under('planning', planning()), ...under('club', club()) }
}
