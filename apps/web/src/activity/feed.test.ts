import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '../api.ts'
import { byDay, emptyLogForm, isNew, logOps, merged, validateLog } from './feed.ts'

const entry = (id: string, at: string, actor: ActivityEntry['actor'], date = at.slice(0, 10)): ActivityEntry =>
  ({ schemaVersion: 1, id, at, date, actor, type: 'event', area: null, delta: id, pointers: [], keys: [], opId: null }) as unknown as ActivityEntry

function workspace(): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy: 'open', workdays: [1, 2, 3, 4, 5], sprint: null, tags: [],
    areas: [{ id: 'bau', label: 'BAU' }],
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  const result = applyBatch(emptyState(settings, '2026-11-10T00:00:00.000Z'), prepareBatch({ ops: [{ type: 'task.add', kind: 'action', title: 'Draft' }] }, { opId: 'seed', at: '2026-11-10T00:00:00.000Z', actor: 'app' }))
  if (!result.ok) throw new Error('fixture')
  return result.state
}

describe('what is new', () => {
  it('is past the app’s marker and not written by the app', () => {
    const cursor = { at: '2026-11-10T09:00:00.000Z', id: 'B' }
    expect(isNew(entry('A', '2026-11-10T08:00:00.000Z', 'claude'), cursor)).toBe(false)
    expect(isNew(entry('C', '2026-11-10T09:00:00.000Z', 'claude'), cursor)).toBe(true)
    expect(isNew(entry('D', '2026-11-10T10:00:00.000Z', 'app'), cursor)).toBe(false)
    expect(isNew(entry('E', '2026-11-10T10:00:00.000Z', 'import'), null)).toBe(true)
  })
})

describe('the feed', () => {
  it('merges pages without repeats, newest first, and groups them by day', () => {
    const page1 = [entry('C', '2026-11-11T09:00:00.000Z', 'claude'), entry('B', '2026-11-10T12:00:00.000Z', 'app')]
    const page2 = [entry('B', '2026-11-10T12:00:00.000Z', 'app'), entry('A', '2026-11-10T08:00:00.000Z', 'import')]
    const all = merged(page1, page2)
    expect(all.map(e => e.id)).toEqual(['C', 'B', 'A'])
    expect(byDay(all).map(d => [d.date, d.entries.map(e => e.id)])).toEqual([['2026-11-11', ['C']], ['2026-11-10', ['B', 'A']]])
  })
})

describe('adding to the log', () => {
  it('is one activity.log op the engine accepts, as the hecate-log skill sends', () => {
    const state = workspace()
    const form = { ...emptyLogForm(), kind: 'session' as const, area: 'bau', text: ' Drafted the scorecard ', keys: 'a1' }
    expect(validateLog(state, form)).toEqual({})
    const ops = logOps(form)
    expect(ops).toEqual([{ type: 'activity.log', entry: 'session', area: 'bau', delta: 'Drafted the scorecard', keys: ['A1'] }])
    const result = applyBatch(state, prepareBatch({ ops }, { opId: 'log', at: '2026-11-10T01:00:00.000Z', actor: 'app' }))
    expect(result.ok && result.activity).toMatchObject([{ type: 'session', area: 'bau', delta: 'Drafted the scorecard', keys: ['A1'], actor: 'app' }])
  })

  it('asks for a line of at most 200 characters, and real keys and areas', () => {
    const state = workspace()
    expect(validateLog(state, emptyLogForm())).toEqual({ text: 'Say what happened, in a line.' })
    expect(validateLog(state, { ...emptyLogForm(), text: 'x'.repeat(201) }).text).toMatch(/^Shorten it to 200/)
    expect(validateLog(state, { ...emptyLogForm(), text: 'Fine', keys: 'A9', area: 'nope' })).toEqual({
      keys: 'There is no A9 in this workspace.', area: 'Choose an area from the list.',
    })
  })
})
