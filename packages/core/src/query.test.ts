import { describe, expect, it } from 'vitest'
import type { FileData } from './files.ts'
import { renderActivity, renderSearch, renderTasks } from './views/render.ts'
import { findTasks, getEntity, searchWorkspace } from './views/query.ts'
import { baseState, ok, run } from './__fixtures__/workspace.ts'

/** baseState: A1 in progress (urgent, scorecard, #reporting), B1 waiting on Sam, A2 (legacy t-a7) depends on both, A3 to do. */
const keys = (r: { tasks: { key: string }[] }) => r.tasks.map(t => t.key)

describe('findTasks', () => {
  it('lists open tasks in board order, and filters on every field', () => {
    const { state } = baseState()
    expect(keys(findTasks(state))).toEqual(['B1', 'A2', 'A3', 'A1'])
    expect(findTasks(state, { kind: 'waiting' }).tasks).toMatchObject([{ key: 'B1', waitingOn: 'Sam', where: 'open' }])
    expect(keys(findTasks(state, { project: 'scorecard' }))).toEqual(['A1'])
    expect(keys(findTasks(state, { project: 'nope' }))).toEqual([])
    expect(keys(findTasks(state, { tag: '#Reporting' }))).toEqual(['A1'])
    expect(keys(findTasks(state, { urgency: 'high' }))).toEqual(['A1'])
    expect(keys(findTasks(state, { status: ['in-progress'] }))).toEqual(['A1'])
    expect(keys(findTasks(state, { text: 'PUBLISH scorecard' }))).toEqual(['A2'])
    expect(keys(findTasks(state, { keys: ['t-a7', 'B1'] }))).toEqual(['B1', 'A2'])
    expect(findTasks(state, { keys: ['A2'] }).tasks[0]).toMatchObject({ blockedBy: ['A1', 'B1'] })
  })

  it('widens to finished and archived tasks, and limits', () => {
    const { state } = baseState()
    const done = ok(run(state, [{ type: 'task.complete', task: 'A3' }])).state
    expect(keys(findTasks(done))).not.toContain('A3')
    expect(findTasks(done, { scope: 'board', keys: ['A3'] }).tasks).toMatchObject([{ key: 'A3', statusName: 'Done', where: 'open' }])
    const closed = ok(run(done, [{ type: 'sprint.close', n: 7 }])).state
    expect(findTasks(closed, { scope: 'board', keys: ['A3'] }).tasks).toEqual([])
    expect(findTasks(closed, { scope: 'all', keys: ['A3'] }).tasks).toMatchObject([{ key: 'A3', where: 'archived', sprint: 7 }])
    expect(findTasks(state, {}, 2)).toMatchObject({ total: 4, tasks: [{ key: 'B1' }, { key: 'A2' }] })
  })
})

describe('searchWorkspace', () => {
  it('finds every kind of thing by all its words, title matches first', () => {
    const { state } = baseState()
    const s = ok(run(state, [
      { type: 'term.upsert', term: 'Target view', meaning: 'Actuals against the scorecard targets.' },
      { type: 'reference.put', name: 'layout-notes', content: '# Layout\n\nThe scorecard uses two columns.\n' },
      { type: 'keepInMind.add', text: 'Hand definitions to the owner.' },
    ])).state
    const scorecard = searchWorkspace(s, 'scorecard')
    expect(scorecard.hits[0]).toMatchObject({ kind: 'project', ref: 'project:scorecard' })
    expect(scorecard.hits.map(h => h.ref)).toEqual(expect.arrayContaining(['A1', 'A2', 'term:Target view', 'reference:layout-notes']))
    expect(searchWorkspace(s, 'two columns').hits).toMatchObject([{ kind: 'reference', snippet: expect.stringContaining('two columns') }])
    expect(searchWorkspace(s, 'sam').hits).toMatchObject([{ kind: 'person' }])
    expect(searchWorkspace(s, 'definitions owner').hits).toMatchObject([{ ref: 'keep-in-mind' }])
    expect(searchWorkspace(s, '   ')).toEqual({ hits: [], total: 0 })
    expect(searchWorkspace(s, 'scorecard', 1)).toMatchObject({ total: scorecard.total })
  })
})

describe('getEntity', () => {
  it('resolves every kind of reference, and null for anything else', () => {
    const { state, samId } = baseState()
    const s = ok(run(state, [
      { type: 'term.upsert', term: 'Target view', aliases: ['TV'], meaning: 'Actuals against targets.' },
      { type: 'focus.setPriorities', weekOf: '2026-11-02', items: [{ tier: 'focus', lead: 'Draft the scorecard' }] },
      { type: 'reference.put', name: 'layout-notes', content: '# Layout\n' },
    ])).state
    expect(getEntity(s, 'A1')).toMatchObject({ kind: 'task', ref: 'A1', data: { where: 'open', summary: { key: 'A1' } } })
    expect(getEntity(s, 'a1')?.ref).toBe('A1')
    expect(getEntity(s, 't-a7')?.ref).toBe('A2')
    expect(getEntity(s, 'task:B1')?.ref).toBe('B1')
    expect(getEntity(s, 'project:scorecard')).toMatchObject({ kind: 'project', data: { name: 'Scorecard' } })
    expect(getEntity(s, 'project:Scorecard')?.ref).toBe('project:scorecard')
    expect(getEntity(s, 'scorecard')?.ref).toBe('project:scorecard')
    expect(getEntity(s, `person:${samId}`)?.ref).toBe(`person:${samId}`)
    expect(getEntity(s, 'person:product manager')?.ref).toBe(`person:${samId}`)
    expect(getEntity(s, 'term:tv')).toMatchObject({ ref: 'term:Target view' })
    expect(getEntity(s, 'focus:2026-11-05')).toMatchObject({ kind: 'focus', ref: 'focus:2026-11-02' })
    expect(getEntity(s, 'focus:2026-12-01')).toBeNull()
    expect(getEntity(s, 'reference:layout-notes')).toEqual({ kind: 'reference', ref: 'reference:layout-notes', data: { name: 'layout-notes', content: '# Layout\n' } })
    expect(getEntity(s, 'profile')?.kind).toBe('profile')
    expect(getEntity(s, 'workspace')?.kind).toBe('workspace')
    expect(getEntity(s, 'sprint:7')).toBeNull()
    expect(getEntity(ok(run(s, [{ type: 'sprint.close', n: 7 }])).state, 'sprint:7')?.kind).toBe('sprint')
    for (const missing of ['A99', 'nothing', 'project:nope', 'person:nobody', 'term:nope', 'focus:not-a-date', 'reference:nope', 'meeting:2026-11-05-x', 'colour:red']) {
      expect(getEntity(s, missing)).toBeNull()
    }
  })
})

describe('renderers for lists', () => {
  it('render tasks, search hits and activity as markdown lists', () => {
    const { state } = baseState()
    const due = ok(run(state, [{ type: 'task.update', task: 'A1', patch: { due: '2026-11-13' } }])).state
    expect(renderTasks(findTasks(due, { keys: ['A1', 'B1', 'A2'] }).tasks, 5)).toBe([
      '- **B1** Layout sign-off — To Do · waiting on Sam',
      '- **A2** Publish the scorecard — To Do · blocked by A1, B1',
      '- 🔴 **A1** Draft the scorecard — In Progress · scorecard · #reporting · due Fri 13 Nov',
      '- … 2 more',
      '',
    ].join('\n'))
    expect(renderTasks([])).toBe('No matching tasks.\n')
    expect(renderSearch([{ kind: 'project', ref: 'project:scorecard', title: 'Scorecard', snippet: 'Scorecard' }])).toBe('- **Scorecard** (`project:scorecard`): Scorecard\n')
    expect(renderSearch([])).toBe('Nothing found.\n')
    const entry = { schemaVersion: 1, id: '01JZ00000000000000000000AA', at: '2026-11-05T00:00:00.000Z', date: '2026-11-05', actor: 'claude', type: 'session', area: 'bau', delta: 'Drafted the scorecard', pointers: [], keys: ['A1'], opId: null } as unknown as FileData<'activityEntry'>
    expect(renderActivity([entry])).toBe('- 2026-11-05 · session · bau: Drafted the scorecard (A1)\n')
    expect(renderActivity([])).toBe('Nothing new.\n')
  })
})
