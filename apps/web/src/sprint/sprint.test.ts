import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, sprintView, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import { closeOps, tally, textOps } from './sprint.ts'

// Sprint 7 runs Wed 4 – Tue 17 Nov (UTC); this is Wed 11 Nov.
const NOW = new Date(Date.UTC(2026, 10, 11, 9, 0))

/** Ops are only right if the engine accepts them. */
function applies(state: WorkspaceState, ops: unknown[]): WorkspaceState {
  const result = applyBatch(state, prepareBatch({ ops }, { opId: 'test', at: NOW.toISOString(), actor: 'app' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.state
}

/** A1 done, A2 in progress. */
function workspace(): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy: 'open', workdays: [1, 2, 3, 4, 5],
    sprint: { anchor: '2026-11-04', anchorNumber: 7, lengthWeeks: 2, external: null }, tags: [], areas: [],
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  return applies(emptyState(settings, NOW.toISOString()), [
    { type: 'task.add', kind: 'action', title: 'Draft', status: 'done' },
    { type: 'task.add', kind: 'action', title: 'Review', status: 'doing' },
  ])
}

const view = (state: WorkspaceState) => {
  const v = sprintView(state, 7, NOW)
  if (!v) throw new Error('no sprint')
  return v
}

describe('the goal and the retro', () => {
  it('starts the sprint to set a goal, then updates it', () => {
    const state = workspace()
    expect(textOps(view(state), 'goal', ' Ship the draft. ')).toEqual([{ type: 'sprint.start', n: 7, goal: 'Ship the draft.' }])
    const started = applies(state, textOps(view(state), 'goal', 'Ship the draft.'))
    expect(started.sprints[7]?.goal).toBe('Ship the draft.')
    expect(textOps(view(started), 'goal', 'Ship the draft.')).toEqual([])
    expect(applies(started, textOps(view(started), 'goal', '')).sprints[7]?.goal).toBeNull()
  })

  it('writes a retro before the sprint has a file, and after it has closed', () => {
    const state = workspace()
    const written = applies(state, textOps(view(state), 'retro', 'Went well.'))
    expect(written.sprints[7]).toMatchObject({ retro: 'Went well.', closedAt: null })
    const closed = applies(written, closeOps(7, 'Went well.'))
    expect(applies(closed, textOps(view(closed), 'retro', 'Went well; the review slipped.')).sprints[7]).toMatchObject({ retro: 'Went well; the review slipped.' })
  })
})

describe('closing', () => {
  it('closes the sprint the page shows, with its retro, exactly as previewed', () => {
    const state = workspace()
    const preview = view(state)
    const closed = applies(state, closeOps(7, ' Steady. '))
    expect(closed.sprints[7]).toMatchObject({ retro: 'Steady.', velocity: preview.velocity, carried: preview.carried.map(t => t.key) })
    expect(closed.sprints[7]?.done.map(t => t.key)).toEqual(preview.done.map(t => t.key))
    expect(tally(closed.sprints[7]?.velocity ?? { done: 0, carried: 0, dropped: 0 })).toBe('1 done · 1 carried · 0 dropped')
  })
})
