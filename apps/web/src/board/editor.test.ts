import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type Task, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import { emptyForm, formFromTask, opsFor, validate } from './editor.ts'

function workspace(): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy: 'open', workdays: [1, 2, 3, 4, 5], sprint: null, tags: [], areas: [],
    statuses: [
      { id: 'backlog', name: 'Backlog', category: 'backlog' },
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  const at = '2026-11-09T00:00:00.000Z'
  const result = applyBatch(emptyState(settings, at), prepareBatch({
    ops: [
      { type: 'project.create', slug: 'scorecard', name: 'Scorecard', status: 'active' },
      { type: 'task.add', kind: 'action', title: 'Draft', project: 'scorecard', tags: ['reporting'] },
      { type: 'task.add', kind: 'waiting', title: 'Targets', waitingOn: { text: 'Finance' } },
    ],
  }, { opId: 'seed', at, actor: 'app' }))
  if (!result.ok) throw new Error('fixture')
  return result.state
}

const taskOf = (state: WorkspaceState, key: string): Task => state.tasks.tasks.find(t => t.key === key) as Task

/** Ops are only right if the engine accepts them. */
function applies(state: WorkspaceState, ops: unknown[]): WorkspaceState {
  const result = applyBatch(state, prepareBatch({ ops }, { opId: 'test', at: '2026-11-09T01:00:00.000Z', actor: 'app' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.state
}

describe('the task editor', () => {
  it('starts a new task in the first to-do status, or the column it was opened from', () => {
    const state = workspace()
    expect(emptyForm(state).status).toBe('to-do')
    expect(emptyForm(state, 'doing').status).toBe('doing')
    expect(emptyForm(state, 'nope').status).toBe('to-do')
    expect(emptyForm(state, undefined, 'scorecard').project).toBe('scorecard')
    expect(emptyForm(state, undefined, 'nope').project).toBe('')
  })

  it('saves a new task as one task.add the engine accepts', () => {
    const state = workspace()
    const form = { ...emptyForm(state), title: ' Publish ', urgency: 'high' as const, project: 'scorecard', dependsOn: 'a1, B1', tags: 'Monthly Report, reporting', due: '2026-11-20' }
    const ops = opsFor(state, form, null)
    expect(ops).toEqual([{ type: 'task.add', ref: '$1', kind: 'action', status: 'to-do', title: 'Publish', note: null, urgency: 'high', tags: ['monthly-report', 'reporting'], project: 'scorecard', dependsOn: ['A1', 'B1'], due: '2026-11-20', waitingOn: null }])
    expect(taskOf(applies(state, ops), 'A2')).toMatchObject({ title: 'Publish', dependsOn: ['A1', 'B1'] })
  })

  it('saves who a new B task waits on', () => {
    const state = workspace()
    const ops = opsFor(state, { ...emptyForm(state), title: 'Sign-off', kind: 'waiting', waitingOn: 'Design lead' }, null)
    expect(taskOf(applies(state, ops), 'B2').waitingOn).toEqual({ personId: null, text: 'Design lead' })
  })

  it('saves only what changed, and a status change as a move', () => {
    const state = workspace()
    const a1 = taskOf(state, 'A1')
    const unchanged = formFromTask(state, a1)
    expect(opsFor(state, unchanged, a1)).toEqual([])
    const ops = opsFor(state, { ...unchanged, title: 'Draft it', status: 'doing', project: '' }, a1)
    expect(ops).toEqual([
      { type: 'task.update', task: 'A1', patch: { title: 'Draft it', project: null } },
      { type: 'task.move', task: 'A1', status: 'doing' },
    ])
    expect(taskOf(applies(state, ops), 'A1')).toMatchObject({ title: 'Draft it', status: 'doing', projectId: null })
  })

  it('edits who a B task waits on', () => {
    const state = workspace()
    const b1 = taskOf(state, 'B1')
    const ops = opsFor(state, { ...formFromTask(state, b1), waitingOn: 'Finance lead' }, b1)
    expect(taskOf(applies(state, ops), 'B1').waitingOn).toEqual({ personId: null, text: 'Finance lead' })
  })

  it('says what is wrong, and how to fix it', () => {
    const state = workspace()
    const form = emptyForm(state)
    expect(validate(state, form, null)).toEqual({ title: 'Give the task a title.' })
    expect(validate(state, { ...form, title: 'x', dependsOn: 'A9' }, null).dependsOn).toBe('There is no A9 in this workspace.')
    expect(validate(state, { ...form, title: 'x', dependsOn: 'C1' }, null).dependsOn).toMatch(/^C1 is not a task key/)
    expect(validate(state, { ...form, title: 'x', dependsOn: 'A1' }, 'A1').dependsOn).toBe('A task cannot depend on itself.')
    expect(validate(state, { ...form, title: 'x\ny' }, null).title).toMatch(/one line/)
    expect(validate(state, { ...form, title: 'Fine', dependsOn: 'a1 b1' }, null)).toEqual({})
  })
})
