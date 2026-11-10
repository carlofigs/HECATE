/**
 * The e2e data: three workspaces built through @hecate/core's own ops, so they
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

/** Two-week sprints: sprint 7 runs Wednesday 4 to Tuesday 17 November, sprint 6 ended Tuesday 3 November. */
const SPRINTS = { anchor: '2026-11-04', anchorNumber: 7, lengthWeeks: 2, external: null }

const STATUSES = [
  { id: 'backlog', name: 'Backlog', category: 'backlog' },
  { id: 'to-do', name: 'To Do', category: 'todo' },
  { id: 'in-progress', name: 'In Progress', category: 'active' },
  { id: 'done', name: 'Done', category: 'done' },
  { id: 'not-doing', name: 'Not Doing', category: 'dropped' },
]

/** A workspace built from batches of ops, each applied at its own time (a sprint can then be closed on what came before). */
function build(settings: { name: string; sprint: unknown }, batches: { at: string; ops: unknown[] }[]): Record<string, string> {
  const workspace = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: settings.name, timezone: 'Australia/Sydney', policy: 'open',
    workdays: [1, 2, 3, 4, 5], sprint: settings.sprint, statuses: STATUSES, tags: [], areas: [],
  })
  let state = emptyState(workspace, batches[0]?.at ?? AT)
  batches.forEach(({ at, ops }, i) => {
    const batch = prepareBatch({ ops }, { opId: `seed-${settings.name}-${i}`, at, actor: 'import', newId: createUlid({ now: () => Date.parse(at) }) })
    const result = applyBatch(state, batch)
    if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2))
    state = result.state
  })
  return filesFromState(state)
}

/** "Planning": everything Today can show. A1–A6, B1. */
function planning(): Record<string, string> {
  return build({ name: 'Planning', sprint: SPRINTS }, [{ at: AT, ops: [
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
  ] }])
}

/** "Club": a workspace with tasks but no plan, schedule or sprint, for Today's empty states. */
function club(): Record<string, string> {
  return build({ name: 'Club', sprint: null }, [{ at: AT, ops: [{ type: 'task.add', kind: 'action', title: 'Book the hall', status: 'backlog' }] }])
}

/**
 * "Studio": projects and sprints as they look after sprint 6 has closed (with
 * a goal and a retro). "Website refresh"
 * has every field filled, two tasks archived by sprint 6 (A1 done, A2
 * dropped), A3 in progress, A4 to do and A5 done on the board. "Newsletter"
 * is a closed project.
 */
function studio(): Record<string, string> {
  return build({ name: 'Studio', sprint: SPRINTS }, [
    {
      at: '2026-10-27T00:00:00.000Z',
      ops: [
        {
          type: 'project.create', slug: 'website', name: 'Website refresh', status: 'active', subtitle: 'A faster site with new copy',
          phase: 'Build', owner: 'Design team', summary: 'Replace the old site with a **faster** one.', currentFocus: 'Finish the copy before the theme work starts.',
          refs: [{ label: 'Tracker', value: 'WEB-12' }],
          nextActions: [{ text: 'Choose a host' }, { text: 'Brief the photographer' }],
          deadlines: [{ date: '2026-11-20', title: 'Launch', hard: true }, { date: '2026-11-06', title: 'Copy review' }],
          cutoffs: [{ date: '2026-11-18', who: 'Design team', what: 'Final assets' }],
          openQuestions: [{ question: 'Which host?', blocker: true }, { question: 'Keep the old blog?', status: 'resolved', resolution: 'Archive it.' }],
          timeline: [{ phase: 'Discovery', start: '2026-10-01', end: '2026-10-20', status: 'done' }, { phase: 'Build', start: '2026-10-21', end: '2026-11-20', status: 'active' }],
          sections: [{ id: 'notes', title: 'Notes', content: 'Keep every page **light**.' }],
        },
        { type: 'project.create', slug: 'newsletter', name: 'Newsletter', status: 'done', subtitle: 'A monthly email' },
        { type: 'sprint.start', n: 6, goal: 'Audit the old site.' },
        { type: 'task.add', kind: 'action', title: 'Audit the old pages', project: 'website' },
        { type: 'task.add', kind: 'action', title: 'Migrate the blog', project: 'website' },
        { type: 'task.complete', task: 'A1' },
        { type: 'task.drop', task: 'A2' },
      ],
    },
    {
      at: AT,
      ops: [
        { type: 'sprint.close', n: 6, retro: 'The audit went well; the blog was not worth moving.' },
        { type: 'task.add', kind: 'action', title: 'Write the copy', status: 'in-progress', project: 'website' },
        { type: 'task.add', kind: 'action', title: 'Choose a theme', status: 'to-do', project: 'website' },
        { type: 'task.add', kind: 'action', title: 'Collect photos', status: 'done', project: 'website' },
      ],
    },
  ])
}

const under = (dir: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]))

/** How many private copies of Planning the harness holds for tests that write (one each, never shared). */
export const SCRATCH_COPIES = 150

/** A scratch copy's directory: hidden (a leading underscore), so the switcher leaves it out. */
export const scratchDir = (n: number): string => `_scratch-${String(n).padStart(3, '0')}`

/** The data repository's files: README, the three workspaces, and the scratch copies of Planning. */
export function fixtureFiles(): Record<string, string> {
  const copy = planning()
  const scratch = Array.from({ length: SCRATCH_COPIES }, (_, i) => under(scratchDir(i + 1), copy))
  return Object.assign({ 'README.md': '# Data\n' }, under('planning', copy), under('club', club()), under('studio', studio()), ...scratch) as Record<string, string>
}
