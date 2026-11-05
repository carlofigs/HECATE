/**
 * The migration against two anonymised v1 workspaces: `old-job` reproduces
 * every quirk found in real v1 data (no column types, suffixed and generated
 * ids, archive duplicates, weeks that do not start on Monday, names in prose,
 * a role that is really a name); `club` is a small open workspace.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkWorkspace, parseActivityLog, stateFromFiles, type Task, type WorkspaceState } from '@hecate/core'
import { migrateConfigSchema, resolveConfig, type MigrateConfig } from './config.ts'
import { FIELD_MAP, entryFor } from './fields.ts'
import { migrateWorkspace } from './migrate.ts'
import { renderReport } from './report.ts'
import { V1_FILES, collectPaths, type V1Files } from './v1.ts'

const AT = '2026-11-05T00:00:00.000Z'

function fixture(dir: 'old-job' | 'club'): V1Files {
  const files: V1Files = {}
  for (const name of V1_FILES) files[name] = readFileSync(new URL(`./__fixtures__/v1/${dir}/${name}.json`, import.meta.url), 'utf8')
  return files
}

const CONFIG: MigrateConfig = migrateConfigSchema.parse({
  defaults: { timezone: 'Australia/Sydney' },
  workspaces: {
    'old-job': { policy: 'sanitised', replacements: { 'Jordan Park': 'Analyst' } },
    club: { name: 'Club' },
  },
})

const migrate = (dir: 'old-job' | 'club', config: MigrateConfig = CONFIG, files: V1Files = fixture(dir)) =>
  migrateWorkspace(dir, files, resolveConfig(dir, config), { at: AT })

function loaded(dir: 'old-job' | 'club', config?: MigrateConfig): WorkspaceState {
  return stateFromFiles(migrate(dir, config).files)
}

const byKey = (state: WorkspaceState): Map<string, Task> => {
  const all = [...state.tasks.tasks, ...Object.values(state.sprints).flatMap(s => [...s.done, ...s.dropped])]
  return new Map(all.map(t => [t.key, t]))
}

describe('validity', () => {
  it.each(['old-job', 'club'] as const)('%s: loads as a v2 workspace with no errors and every field accounted for', dir => {
    const { files, report } = migrate(dir)
    expect(report.errors).toEqual([])
    expect(report.unaccounted).toEqual([])
    expect(report.loaded).toBe(true)
    const state = stateFromFiles(files)
    expect(checkWorkspace(state).filter(i => i.severity === 'error')).toEqual([])
    const activity = Object.entries(files).filter(([path]) => path.startsWith('activity/'))
    expect(activity).toHaveLength(1)
    expect(parseActivityLog(activity[0]?.[1] ?? '')).toMatchObject([{ actor: 'import', type: 'event', date: '2026-11-05' }])
  })

  it('the fixtures exercise every entry in the field map', () => {
    const seen = new Map<string, number>()
    for (const dir of ['old-job', 'club'] as const) {
      const files = fixture(dir)
      for (const name of V1_FILES) collectPaths(name, JSON.parse(files[name] ?? 'null'), seen)
    }
    expect(Object.keys(FIELD_MAP).filter(path => !seen.has(path))).toEqual([])
    expect([...seen.keys()].filter(path => entryFor(path) === null)).toEqual([])
  })

  it('is deterministic: the same input and time give the same bytes', () => {
    expect(migrate('old-job').files).toEqual(migrate('old-job').files)
  })
})

describe('task keys', () => {
  const { report } = migrate('old-job')
  const state = loaded('old-job')
  const tasks = byKey(state)

  it('keeps t-aN / t-bN numbers and the old id', () => {
    expect(tasks.get('A12')).toMatchObject({ kind: 'action', legacyIds: ['t-a12'], status: 'to-do', urgency: 'high' })
    expect(tasks.get('B3')).toMatchObject({ kind: 'waiting', legacyIds: ['t-b3'], status: 'in-review', waitingOn: null })
  })

  it('allocates fresh keys after the highest kept number, in creation order', () => {
    // Claimed: A1 A2 A3 A5 A7 A8 A12, B2 B3 B4. Fresh, oldest first: the duplicate t-a5 (2 Mar),
    // t-a12-2 (10 Mar), t-b-lx3k9s (11 Mar, B series), t-a-lx3k9r (12 Mar), the archived task with no id (20 Mar).
    expect(tasks.get('A13')).toMatchObject({ title: 'Rebuild the weekly extract (copy)', legacyIds: [] })
    expect(tasks.get('A14')).toMatchObject({ legacyIds: ['t-a12-2'], title: 'Draft the scorecard targets (second half)' })
    expect(tasks.get('B5')).toMatchObject({ kind: 'waiting', legacyIds: ['t-b-lx3k9s'] })
    expect(tasks.get('A15')).toMatchObject({ legacyIds: ['t-a-lx3k9r'] })
    expect(tasks.get('A16')).toMatchObject({ legacyIds: [], title: 'Book the review room' })
    expect(state.tasks.nextKey).toEqual({ A: 17, B: 6 })
    expect(report.keys).toMatchObject({
      open: 9, archived: 6, fromId: 10, fresh: 5, duplicateOpen: 1, archivedDuplicates: 1, archivedAlsoOpen: 1, archivedWithoutId: 1,
    })
  })

  it('breaks creation-time ties by the v1 id in natural order', () => {
    const club = byKey(loaded('club'))
    expect(['A1', 'A2', 'A3'].map(k => club.get(k)?.legacyIds[0])).toEqual(['club-01', 'club-02', 'club-10'])
  })

  it('keeps the board copy of a task that was also archived, and the earliest of repeated archive copies', () => {
    expect(state.tasks.tasks.find(t => t.key === 'A7')).toMatchObject({ status: 'done', completedAt: '2026-03-26T04:00:00.000Z' })
    expect(Object.values(state.sprints).flatMap(s => s.done.map(t => t.key)).sort()).toEqual(['A1', 'A16', 'A2', 'A3', 'A8'])
    expect(state.sprints[-3]?.done.map(t => t.key)).toEqual(['A1', 'A2'])
  })
})

describe('statuses and tasks', () => {
  const state = loaded('old-job')

  it('infers categories from column names and adds the category the board lacked', () => {
    expect(state.workspace.statuses).toEqual([
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'in-progress', name: 'In Progress', category: 'active' },
      { id: 'in-review', name: 'In Review', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'backlog', name: 'Backlog', category: 'backlog' },
      { id: 'not-doing', name: 'Not Doing', category: 'dropped' },
    ])
    expect(loaded('club').workspace.statuses.map(s => [s.id, s.category])).toEqual([
      ['to-do', 'todo'], ['doing', 'active'], ['done', 'done'], ['parked', 'dropped'], ['ideas', 'backlog'],
    ])
  })

  it('maps priority, blockedSince, tags, projects and references', () => {
    const tasks = byKey(state)
    const scorecard = state.projects.scorecard?.id
    expect(tasks.get('A5')).toMatchObject({ urgency: 'med', note: '[Analyst] has the old query.\n\nBlocked since 2026-03-20.' })
    expect(tasks.get('A12')).toMatchObject({ tags: ['scorecard', 'reporting'], projectId: scorecard, note: 'Needs B3 first. Ask [Product manager] about the layout.' })
    expect(tasks.get('A2')?.projectId).toBe(state.projects.handover?.id)
    expect(state.workspace.tags).toEqual([
      { id: 'scorecard', label: 'Scorecard' }, { id: 'reporting', label: null }, { id: 'handover', label: null },
    ])
  })

  it('archived tasks are complete v2 tasks, timed by their archive', () => {
    expect(state.sprints[-1]?.dropped).toMatchObject([
      { key: 'B2', kind: 'waiting', status: 'not-doing', note: 'No longer needed.', completedAt: '2026-03-27T07:00:00.000Z', createdAt: '2026-03-27T07:00:00.000Z' },
    ])
  })
})

describe('legacy sprints', () => {
  it('without a cadence: one per week, numbered back from -1', () => {
    const state = loaded('old-job')
    expect(Object.values(state.sprints).map(s => [s.n, s.start, s.end, s.legacy, s.closedAt]).sort((x, y) => (x[0] as number) - (y[0] as number))).toEqual([
      [-3, '2026-03-09', '2026-03-15', true, '2026-03-14T03:00:00.000Z'],
      [-2, '2026-03-16', '2026-03-22', true, '2026-03-20T07:00:00.000Z'],
      [-1, '2026-03-23', '2026-03-29', true, '2026-03-28T03:00:00.000Z'],
    ])
    const last = state.sprints[-1]
    expect(last?.sections.map(s => s.title)).toEqual([
      'Completed', 'Carried forward', 'Delayed', 'Next week', 'Meetings and discussions', 'Decisions made',
      '1:1 prep — [Head of data]', '1:1 prep — [person not in memory]',
    ])
    expect(last?.sections.find(s => s.id === 'completed')?.content).toBe('- **A3** Tidy the backlog — Cut to live work.\n- Something since deleted #reporting')
    expect(last?.sections.find(s => s.id === 'carried-forward')?.content).toBe('- **A12** Draft the scorecard targets #scorecard\n  Waiting on B3.\n  Second line.')
    expect(last?.sections.find(s => s.id === 'one-on-one-head-of-data')?.content).toBe('Raise A12 and the sign-off date.')
  })

  it('with a cadence: weeks fall into the sprint that contains them', () => {
    const state = loaded('old-job', migrateConfigSchema.parse({
      ...CONFIG,
      workspaces: { ...CONFIG.workspaces, 'old-job': { ...CONFIG.workspaces?.['old-job'], sprint: { anchor: '2026-03-04', anchorNumber: 3, lengthWeeks: 2, external: null } } },
    }))
    expect(Object.values(state.sprints).map(s => [s.n, s.start, s.end]).sort()).toEqual([[3, '2026-03-04', '2026-03-17'], [4, '2026-03-18', '2026-03-31']])
    expect(state.sprints[3]?.done.map(t => t.key)).toEqual(['A1', 'A2', 'A16'])
    expect(state.sprints[3]?.sections.map(s => s.title)).toEqual([
      'Week of 9 Mar 2026 — Completed', 'Week of 9 Mar 2026 — Next week', 'Week of 9 Mar 2026 — Meetings and discussions',
      'Week of 16 Mar 2026 — Completed', 'Week of 16 Mar 2026 — Frustrations',
    ])
    expect(state.sprints[3]?.sections[0]?.id).toBe('2026-03-09-completed')
  })
})

describe('focus', () => {
  it('moves the week to its Monday, keeps sections as freeform, drops calendar events', () => {
    const { report } = migrate('old-job')
    const state = loaded('old-job')
    expect(Object.keys(state.focusWeeks)).toEqual(['2026-04-13'])
    const week = state.focusWeeks['2026-04-13']
    expect(week?.sections.map(s => [s.id, s.title])).toEqual([
      ['sprint', 'Sprint'], ['today', 'Today: Tue 14 Apr'], ['waiting-on', 'Waiting On'], ['keep-in-mind', 'Keep in Mind'],
    ])
    expect(week?.sections[1]?.content).toBe('1. Finish A12.\n2. Chase [Head of data] on B3.')
    expect(week?.sections[2]?.content).toContain('| t-b9 | Finance |')
    expect(week?.sections[3]?.content).toBe('Use `t-a12` in code spans as written.')
    expect(week?.schedule).toEqual([])
    expect(report.normalisations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'calendar-dropped', count: 2 }),
      expect.objectContaining({ id: 'ref-unresolved', count: 1 }),
    ]))
  })

  it('does not carry over an empty focus page', () => {
    expect(loaded('club').focusWeeks).toEqual({})
  })
})

describe('projects and memory', () => {
  const state = loaded('old-job')

  it('maps project fields, numbers and models', () => {
    const p = state.projects.scorecard
    expect(p).toMatchObject({
      name: 'Scorecard', status: 'active', phase: 'Build', owner: '[Product manager]', updatedAt: '2026-03-27T00:00:00.000Z',
      refs: [{ label: 'Jira', value: 'TRACK-12' }, { label: 'Branch', value: 'feature/scorecard' }],
      nextActions: [{ text: 'Draft targets (A12) once B3 lands', keys: ['A12', 'B3'] }],
    })
    expect(p?.openQuestions.map(q => [q.n, q.status, q.keys])).toEqual([[1, 'resolved', ['B3']], [3, 'open', []], [4, 'deferred', []], [5, 'open', []]])
    expect(p?.timeline.map(t => t.status)).toEqual(['done', 'active', 'pending'])
    expect(p?.sections.map(s => s.id)).toEqual(['decisions', 'decisions-2', 'models'])
    expect(p?.sections[2]?.content).toBe('| Model | Layer | Dev | Prod | Status |\n|---|---|---|---|---|\n| stg_sales | staging | view | view | Done |\n| mart_scorecard | mart | table | incremental (TBC) | Skeleton \\| blocked OQ-03 |')
    expect(state.projects.handover).toMatchObject({ status: 'done', summary: 'Notes passed on by [Product manager] when they moved teams.', owner: null })
    expect(loaded('club').projects.fixtures?.openQuestions[0]).toMatchObject({ status: 'resolved', resolution: 'Resolved in v1; no resolution was recorded.' })
  })

  it('splits memory into profile, people, glossary and references', () => {
    expect(state.profile).toMatchObject({ me: 'Analyst on the reporting team.', preferences: 'Short updates.\nTables over prose.', responsibilities: [{ name: 'Monthly numbers', cadence: 'Monthly' }] })
    expect(state.glossary.terms.map(t => [t.term, t.meaning])).toEqual([['GMV', 'Gross merchandise value.\n\nBefore returns.'], ['Scorecard', 'The monthly targets view.']])
    expect(Object.keys(state.references).sort()).toEqual(['context-team', 'people-product-manager', 'project-notes'])
    expect(state.references['project-notes']).toBe('# Project notes\n\nCarried over from HECATE v1 memory.\n\n## Old pipeline\n\nRetired in February.\n')
  })
})

describe('sanitised workspaces', () => {
  const { files, report } = migrate('old-job')
  const text = Object.values(files).join('\n')

  it('stores people as roles and leaves no name in any file', () => {
    const state = stateFromFiles(files)
    expect(state.people.people.map(p => [p.name, p.aliases, p.role])).toEqual([
      [null, [], 'Product manager'], [null, [], 'Head of data'], [null, [], 'Colleague'],
    ])
    for (const name of ['Alex', 'Smith', 'Lex', 'Sam', 'Lee', 'Sammy', 'Riley', 'Chen', 'Jordan', 'Park', 'Casey']) {
      expect(text).not.toMatch(new RegExp(`\\b${name}\\b`))
    }
    expect(text).toContain('[Product manager]')
    expect(report.sanitised).toMatchObject({ possibleNames: 0 })
    expect(report.normalisations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'role-had-name', count: 1 }),
      expect.objectContaining({ id: 'unlisted-person', count: 1 }),
    ]))
  })

  it('keeps names in an open workspace', () => {
    const open = loaded('old-job', { defaults: { timezone: 'Australia/Sydney' } })
    expect(open.people.people.map(p => [p.name, p.aliases, p.role])).toEqual([
      ['Alex Smith', ['Lex'], 'Product manager'], ['Sam Lee', ['Sammy'], 'Head of data'], ['Riley', [], 'Riley Chen'],
    ])
    expect(byKey(open).get('A12')?.note).toBe('Needs B3 first. Ask Alex Smith about the layout.')
  })
})

describe('field accounting', () => {
  it('reports a v1 field it does not know, and does not count as ready', () => {
    const files = fixture('club')
    const tasks = JSON.parse(files.tasks ?? '')
    tasks.columns[0].tasks[0].estimate = 3
    tasks.columns[0].colour = 'red'
    const { report } = migrate('club', CONFIG, { ...files, tasks: JSON.stringify(tasks) })
    expect(report.unaccounted).toHaveLength(2)
    expect(report.unaccounted).toEqual(expect.arrayContaining([
      { path: 'tasks.columns[].colour', count: 1 },
      { path: 'tasks.columns[].tasks[].estimate', count: 1 },
    ]))
    expect(renderReport([report], { at: AT })).toContain('**Not ready** — 0 errors, 2 unaccounted fields')
  })

  it('reports an unreadable or newer v1 file as an error', () => {
    const { report } = migrate('club', CONFIG, { ...fixture('club'), settings: '{ not json', archive: '{ "schemaVersion": 2, "weeks": [] }' })
    expect(report.errors.map(e => e.path)).toEqual(['archive.json (v1)', 'settings.json (v1)'])
  })
})

describe('report', () => {
  it('matches the golden report for the fixtures', async () => {
    const reports = (['club', 'old-job'] as const).map(dir => migrate(dir).report)
    await expect(renderReport(reports, { at: AT })).toMatchFileSnapshot('./__fixtures__/report.md')
  })
})
