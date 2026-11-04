/**
 * One valid file of every kind, as raw JSON (what a reader gets from disk).
 * Generic names only — this repository is public.
 */

import type { FileKind } from '../kinds.ts'
import { createUlid } from '../ulid.ts'

/** Deterministic ids: a fixed clock and zeroed randomness, incremented per call. */
const nextId = createUlid({ now: () => 1_793_750_400_000, random: bytes => bytes.fill(0) })
const id = (): string => nextId()

const AT = '2026-11-04T09:30:00.000Z'

const ids = {
  alex: id(),
  sam: id(),
  project: id(),
  planItem: id(),
}

const task = (key: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: id(),
  key,
  legacyIds: [],
  kind: key.startsWith('A') ? 'action' : 'waiting',
  title,
  note: null,
  status: 'todo',
  order: 'a0',
  urgency: null,
  tags: [],
  projectId: null,
  waitingOn: null,
  dependsOn: [],
  due: null,
  createdAt: AT,
  updatedAt: AT,
  completedAt: null,
  ...extra,
})

export const validFiles: Record<FileKind, Record<string, unknown>> = {
  workspace: {
    schemaVersion: 1,
    name: 'Example workspace',
    timezone: 'Australia/Sydney',
    policy: 'open',
    workdays: [1, 2, 3, 4, 5],
    sprint: { anchor: '2026-09-30', anchorNumber: 5, lengthWeeks: 2, external: { label: 'Tracker', offset: 2 } },
    statuses: [
      { id: 'backlog', name: 'Backlog', category: 'backlog' },
      { id: 'todo', name: 'To Do', category: 'todo' },
      { id: 'in-progress', name: 'In Progress', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'not-doing', name: 'Not Doing', category: 'dropped' },
    ],
    tags: [{ id: 'admin', label: null }, { id: 'reporting', label: 'Reporting' }],
    areas: [{ id: 'bau', label: 'BAU' }, { id: 'meeting', label: 'Meeting' }],
  },

  profile: {
    schemaVersion: 1,
    updatedAt: AT,
    me: 'Analyst on the reporting team.',
    preferences: '- Tables over prose',
    productivitySystem: 'Two-week sprints, Wednesday to Tuesday.',
    responsibilities: [{ id: id(), name: 'Weekly report run', cadence: 'Monday mornings', notes: null }],
  },

  tasks: {
    schemaVersion: 1,
    nextKey: { A: 4, B: 2 },
    tasks: [
      task('A1', 'Draft the scorecard', { status: 'in-progress', urgency: 'high', tags: ['reporting'], projectId: ids.project, due: '2026-11-10' }),
      task('A2', 'Publish the scorecard', { dependsOn: ['A1', 'B1'], legacyIds: ['t-a2'] }),
      task('A3', 'Tidy the backlog', { status: 'done', completedAt: AT }),
      task('B1', 'Sign-off on the scorecard layout', { waitingOn: { personId: ids.sam, text: null }, urgency: 'med' }),
    ],
  },

  focusWeek: {
    schemaVersion: 1,
    weekOf: '2026-11-02',
    updatedAt: AT,
    scheduleCapturedAt: AT,
    schedule: [
      { id: id(), date: '2026-11-04', start: '10:00', end: '10:30', title: 'Stand-up', personal: false, relevance: null, note: null, keys: [], important: false },
      { id: id(), date: '2026-11-04', start: '13:30', end: '14:00', title: '1:1 with Sam', personal: false, relevance: 'high', note: 'Layout sign-off', keys: ['B1'], important: true },
      { id: id(), date: '2026-11-05', start: '12:00', end: '13:00', title: null, personal: true, relevance: null, note: null, keys: [], important: false },
      { id: id(), date: '2026-11-06', start: null, end: null, title: 'Focus day', personal: false, relevance: 'low', note: null, keys: [], important: false },
    ],
    days: [
      {
        date: '2026-11-03',
        plan: [{ id: ids.planItem, lead: 'Draft the scorecard', detail: null, keys: ['A1'], urgency: 'high' }],
        outcomes: [{ id: id(), planItemId: ids.planItem, result: 'carried', lead: 'Draft the scorecard', note: 'Waiting on the layout', keys: ['A1'] }],
        closedAt: AT,
        note: null,
      },
    ],
    callouts: [{ id: id(), lead: 'Sprint 7 closes Tuesday', text: 'Review and planning on **Tue 10 Nov**.', keys: [] }],
    priorities: [
      { id: id(), tier: 'focus', lead: 'Draft the scorecard', detail: 'Gates the publish step.', keys: ['A1'] },
      { id: id(), tier: 'ongoing', lead: 'Weekly report run', detail: null, keys: [] },
    ],
    lastWeek: [{ id: id(), text: 'Backlog tidied.', keys: ['A3'] }],
    sections: [{ id: 'notes', title: 'Notes', content: 'Anything else.' }],
  },

  keepInMind: {
    schemaVersion: 1,
    updatedAt: AT,
    items: [{ id: id(), lead: 'Definitions are handed over, not carried.', text: 'Raise and hand over.', keys: [], projectId: null, createdAt: AT }],
  },

  project: {
    schemaVersion: 1,
    id: ids.project,
    slug: 'scorecard',
    name: 'Scorecard',
    subtitle: 'Monthly team scorecard',
    summary: null,
    status: 'active',
    phase: 'Build',
    currentFocus: 'Layout',
    owner: 'Alex',
    refs: [{ label: 'Tracker epic', value: 'EPIC-1' }],
    deadlines: [{ id: id(), date: '2026-11-20', title: 'First publish', hard: true, keys: ['A2'], note: null }],
    cutoffs: [{ id: id(), date: '2026-11-13', personId: ids.sam, who: 'Sam', what: 'Sign-off before leave', keys: ['B1'] }],
    openQuestions: [
      { id: id(), n: 1, question: 'Which targets are shown?', blocker: true, status: 'open', resolution: null, keys: [] },
      { id: id(), n: 2, question: 'Monthly or weekly?', blocker: false, status: 'resolved', resolution: 'Monthly.', keys: [] },
    ],
    nextActions: [{ id: id(), text: 'Agree the layout', keys: ['B1'] }, { id: id(), text: 'Draft', keys: ['A1'] }],
    timeline: [{ id: id(), phase: 'Build', start: '2026-10-28', end: null, status: 'active' }],
    sections: [],
    updatedAt: AT,
  },

  sprint: {
    schemaVersion: 1,
    n: 6,
    start: '2026-10-14',
    end: '2026-10-27',
    goal: 'Ship the first draft.',
    closedAt: AT,
    done: [task('A3', 'Tidy the backlog', { status: 'done', completedAt: AT })],
    dropped: [],
    carried: ['A1'],
    retro: 'Went well: pairing on the layout.',
    velocity: { done: 1, carried: 1, dropped: 0 },
    sections: [],
    legacy: false,
  },

  people: {
    schemaVersion: 1,
    updatedAt: AT,
    people: [
      { id: ids.alex, name: 'Alex', aliases: [], role: 'Analyst', notes: null, ooo: [] },
      { id: ids.sam, name: 'Sam', aliases: ['S.'], role: 'Product manager', notes: null, ooo: [{ start: '2026-11-16', end: '2026-11-20', note: 'Leave' }] },
    ],
  },

  glossary: {
    schemaVersion: 1,
    terms: [{ id: id(), term: 'BAU', aliases: ['Business as usual'], meaning: 'Recurring operational work.', projectId: null }],
  },

  activityEntry: {
    schemaVersion: 1,
    id: id(),
    at: AT,
    date: '2026-11-04',
    actor: 'claude',
    type: 'flag',
    area: 'bau',
    delta: 'A1 started; B1 still blocking the publish step',
    pointers: ['tasks.json'],
    keys: ['A1', 'B1'],
    opId: null,
  },

  meetingFrontmatter: {
    schemaVersion: 1,
    id: id(),
    date: '2026-11-04',
    title: 'Scorecard check-in',
    input: 'notes',
    sources: ['notes.md'],
    conflicts: 0,
    projectIds: [ids.project],
    personIds: [ids.sam],
    keys: ['A1', 'B1'],
    processedAt: AT,
  },
}

/** A deep copy, so a test can break one field without affecting others. */
export function validFile(kind: FileKind): Record<string, unknown> {
  return JSON.parse(JSON.stringify(validFiles[kind])) as Record<string, unknown>
}
