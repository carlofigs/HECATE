import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import {
  canMoveAction, emptyItemForm, emptyProjectForm, itemFormFor, itemName, moveActionOps, projectForm, projectOps, questionLabel, removeItemOps,
  restoreItemOps, saveItemOps, slugFor, validateItem, validateProject, type Project,
} from './project.ts'

/** Ops are only right if the engine accepts them. */
function applies(state: WorkspaceState, ops: unknown[]): WorkspaceState {
  const result = applyBatch(state, prepareBatch({ ops }, { opId: 'test', at: '2026-11-09T01:00:00.000Z', actor: 'app' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.state
}

/** A1, and a "website" project with two next actions, a deadline, a cutoff and two questions (OQ-01 open, OQ-02 resolved). */
function workspace(): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy: 'open', workdays: [1, 2, 3, 4, 5], sprint: null, tags: [], areas: [],
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  return applies(emptyState(settings, '2026-11-09T00:00:00.000Z'), [
    { type: 'person.upsert', name: 'Sam', role: 'Designer' },
    { type: 'task.add', kind: 'action', title: 'Draft the copy' },
    {
      type: 'project.create', slug: 'website', name: 'Website', status: 'active',
      nextActions: [{ text: 'Choose a theme' }, { text: 'Write the copy', keys: ['A1'] }],
      deadlines: [{ date: '2026-11-20', title: 'Launch', hard: true }],
      cutoffs: [{ date: '2026-11-18', who: 'Design team', what: 'Final assets' }],
      openQuestions: [{ question: 'Which host?', blocker: true }, { question: 'Old blog?', status: 'resolved', resolution: 'Archive it.' }],
    },
  ])
}

const projectOf = (state: WorkspaceState): Project => state.projects.website as Project
const ids = (list: readonly { id: string }[]): string[] => list.map(x => x.id)

describe('the project overview', () => {
  it('creates a project from a name, with the slug it suggests', () => {
    const state = workspace()
    const form = { ...emptyProjectForm(), name: ' Team offsite ', slug: slugFor('Team offsite'), status: 'planned' as const, owner: 'Sam' }
    expect(form.slug).toBe('team-offsite')
    expect(validateProject(state, form, null)).toEqual({})
    const ops = projectOps(form, null)
    expect(ops).toEqual([{ type: 'project.create', slug: 'team-offsite', name: 'Team offsite', status: 'planned', subtitle: null, phase: null, owner: 'Sam', summary: null, currentFocus: null }])
    expect(applies(state, ops).projects['team-offsite']).toMatchObject({ name: 'Team offsite', status: 'planned', owner: 'Sam' })
  })

  it('patches only what changed, and nothing when nothing did', () => {
    const state = workspace()
    const p = projectOf(state)
    expect(projectOps(projectForm(p), p)).toEqual([])
    const ops = projectOps({ ...projectForm(p), status: 'paused', phase: 'Build', summary: '' }, p)
    expect(ops).toEqual([{ type: 'project.update', slug: 'website', patch: { status: 'paused', phase: 'Build' } }])
    expect(projectOf(applies(state, ops))).toMatchObject({ status: 'paused', phase: 'Build', nextActions: p.nextActions })
  })

  it('refuses a slug that is taken or malformed, and a missing name', () => {
    const state = workspace()
    expect(validateProject(state, { ...emptyProjectForm(), name: 'Website', slug: 'website' }, null).slug).toMatch(/^There is already a project “website”/)
    expect(validateProject(state, { ...emptyProjectForm(), name: 'X', slug: 'Bad Slug' }, null).slug).toMatch(/^Use lower-case letters/)
    expect(validateProject(state, emptyProjectForm(), null)).toMatchObject({ name: 'Name the project.' })
    expect(validateProject(state, { ...projectForm(projectOf(state)), phase: 'a\nb' }, projectOf(state)).phase).toMatch(/one line/)
  })
})

describe('next actions, deadlines, cutoffs and questions', () => {
  it('adds a next action at the end and sends every item back with its id', () => {
    const state = workspace()
    const p = projectOf(state)
    const ops = saveItemOps(p, 'action', { ...emptyItemForm(), text: 'Book the photographer', keys: 'a1' }, null)
    const after = projectOf(applies(state, ops))
    expect(after.nextActions.map(a => a.text)).toEqual(['Choose a theme', 'Write the copy', 'Book the photographer'])
    expect(ids(after.nextActions).slice(0, 2)).toEqual(ids(p.nextActions))
    expect(after.nextActions[2]?.keys).toEqual(['A1'])
  })

  it('moves a next action, and Undo puts the list back exactly', () => {
    const state = workspace()
    const p = projectOf(state)
    const [a, b] = ids(p.nextActions)
    expect(canMoveAction(p, a ?? '', -1)).toBe(false)
    const after = applies(state, moveActionOps(p, a ?? '', 1))
    expect(ids(projectOf(after).nextActions)).toEqual([b, a])
    expect(ids(projectOf(applies(after, restoreItemOps(p, 'action'))).nextActions)).toEqual([a, b])
  })

  it('edits a deadline in place and saves nothing when nothing changed', () => {
    const state = workspace()
    const p = projectOf(state)
    const id = p.deadlines[0]?.id ?? ''
    const form = itemFormFor(p, 'deadline', id)
    if (!form) throw new Error('form')
    expect(saveItemOps(p, 'deadline', form, id)).toEqual([])
    const after = projectOf(applies(state, saveItemOps(p, 'deadline', { ...form, hard: false, note: 'Soft launch first' }, id)))
    expect(after.deadlines).toMatchObject([{ id, title: 'Launch', hard: false, note: 'Soft launch first' }])
  })

  it('keeps a cutoff’s person when its text is edited', () => {
    const state = workspace()
    const samId = state.people.people[0]?.id ?? ''
    const withPerson = applies(state, [{ type: 'project.update', slug: 'website', patch: { cutoffs: [{ date: '2026-11-18', personId: samId, who: 'Sam', what: 'Final assets' }] } }])
    const p = projectOf(withPerson)
    const id = p.cutoffs[0]?.id ?? ''
    const form = itemFormFor(p, 'cutoff', id)
    if (!form) throw new Error('form')
    const after = projectOf(applies(withPerson, saveItemOps(p, 'cutoff', { ...form, what: 'Final photos' }, id)))
    expect(after.cutoffs).toMatchObject([{ id, personId: samId, what: 'Final photos' }])
    expect(itemName(after, 'cutoff', id)).toBe('Sam: Final photos')
  })

  it('numbers a new question after the others, and keeps every number when one is resolved or reopened', () => {
    const state = workspace()
    const p = projectOf(state)
    const addedState = applies(state, saveItemOps(p, 'question', { ...emptyItemForm(), text: 'Who writes the copy?', blocker: true }, null))
    const added = projectOf(addedState)
    expect(added.openQuestions.map(q => [q.n, q.status])).toEqual([[1, 'open'], [2, 'resolved'], [3, 'open']])
    expect(questionLabel(3)).toBe('OQ-03')

    const first = added.openQuestions[0]?.id ?? ''
    const form = itemFormFor(added, 'question', first)
    if (!form) throw new Error('form')
    expect(validateItem(state, 'question', { ...form, status: 'resolved' }).resolution).toBe('Say how it was resolved.')
    const resolvedState = applies(addedState, saveItemOps(added, 'question', { ...form, status: 'resolved', resolution: 'Use a static host.' }, first))
    const resolved = projectOf(resolvedState)
    expect(resolved.openQuestions[0]).toMatchObject({ id: first, n: 1, status: 'resolved', resolution: 'Use a static host.' })

    const reopenForm = itemFormFor(resolved, 'question', first)
    if (!reopenForm) throw new Error('form')
    const reopened = projectOf(applies(resolvedState, saveItemOps(resolved, 'question', { ...reopenForm, status: 'open' }, first)))
    expect(reopened.openQuestions[0]).toMatchObject({ n: 1, status: 'open', resolution: null })
    expect(reopened.openQuestions.map(q => q.n)).toEqual([1, 2, 3])
  })

  it('removes an item and keeps the rest with their ids', () => {
    const state = workspace()
    const p = projectOf(state)
    const [first, second] = p.openQuestions
    const after = projectOf(applies(state, removeItemOps(p, 'question', first?.id ?? '')))
    expect(after.openQuestions).toMatchObject([{ id: second?.id, n: 2 }])
  })

  it('refuses what core would, in words that say how to fix it', () => {
    const state = workspace()
    expect(validateItem(state, 'action', emptyItemForm())).toEqual({ text: 'Say what to do next.' })
    expect(validateItem(state, 'deadline', emptyItemForm())).toEqual({ date: 'Choose a date.', text: 'Name the deadline.' })
    expect(validateItem(state, 'cutoff', { ...emptyItemForm(), date: '2026-11-18', who: 'Design' })).toEqual({ what: 'Say what closes.' })
    expect(validateItem(state, 'question', { ...emptyItemForm(), text: 'Fine?', keys: 'A9' }).keys).toBe('There is no A9 in this workspace.')
  })
})
