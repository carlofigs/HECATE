import { applyBatch, CURRENT_VERSION, emptyState, parseFile, prepareBatch, type WorkspaceState } from '@hecate/core'
import { describe, expect, it } from 'vitest'
import {
  emptyLeaveForm, emptyPersonForm, emptyTermForm, glossary, leaveForm, personForm, personOps, removalDescription, removeLeaveOps, removePersonOps, removeTermOps, restoreLeaveOps,
  restoreTermOps, saveLeaveOps, termForm, termOps, validateLeave, validatePerson, validateTerm, type Person,
} from './people.ts'

/** Ops are only right if the engine accepts them. */
function applies(state: WorkspaceState, ops: unknown[]): WorkspaceState {
  const result = applyBatch(state, prepareBatch({ ops }, { opId: 'test', at: '2026-11-09T01:00:00.000Z', actor: 'app' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.state
}

function workspace(policy: 'open' | 'sanitised' = 'open'): WorkspaceState {
  const settings = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Test', timezone: 'UTC', policy, workdays: [1, 2, 3, 4, 5], sprint: null, tags: [], areas: [],
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'dropped', name: 'Dropped', category: 'dropped' },
    ],
  })
  return applies(emptyState(settings, '2026-11-09T00:00:00.000Z'), [
    { type: 'project.create', slug: 'website', name: 'Website' },
    { type: 'person.upsert', role: 'Designer', ...(policy === 'open' ? { name: 'Robin', aliases: ['Rob'] } : {}), ooo: [{ start: '2026-11-12', end: '2026-11-13' }] },
    { type: 'term.upsert', term: 'CMS', meaning: 'Where the pages are edited.' },
  ])
}

const first = (state: WorkspaceState): Person => state.people.people[0] as Person
let n = 0
const newId = (): string => `01KQ${String(n++).padStart(22, '0')}`

describe('a person', () => {
  it('adds a person with an id chosen here, so the page can open them', () => {
    const state = workspace()
    const ops = personOps(state, { ...emptyPersonForm(), role: ' Analyst ', name: 'Sam', aliases: 'S., Sammy' }, null, newId)
    expect(ops).toEqual([{ type: 'person.upsert', id: expect.stringMatching(/^01KQ/), role: 'Analyst', notes: null, name: 'Sam', aliases: ['S.', 'Sammy'] }])
    const id = (ops[0] as { id: string }).id
    expect(applies(state, ops).people.people.find(p => p.id === id)).toMatchObject({ name: 'Sam', role: 'Analyst', aliases: ['S.', 'Sammy'] })
  })

  it('patches only what changed, and nothing when nothing did', () => {
    const state = workspace()
    const p = first(state)
    expect(personOps(state, personForm(p), p)).toEqual([])
    const ops = personOps(state, { ...personForm(p), notes: 'Owns the **logo**.' }, p)
    expect(ops).toEqual([{ type: 'person.upsert', id: p.id, notes: 'Owns the **logo**.' }])
    expect(first(applies(state, ops))).toMatchObject({ name: 'Robin', notes: 'Owns the **logo**.', ooo: p.ooo })
  })

  it('never offers a name or aliases in a sanitised workspace', () => {
    const state = workspace('sanitised')
    expect(validatePerson(state, { ...emptyPersonForm(), role: 'Team lead', name: 'Sam' })).toEqual({ name: expect.stringMatching(/sanitised/) })
    const ops = personOps(state, { ...emptyPersonForm(), role: 'Team lead' }, null, newId)
    expect(ops).toEqual([{ type: 'person.upsert', id: expect.any(String), role: 'Team lead', notes: null }])
    expect(applies(state, ops).people.people).toHaveLength(2)
  })

  it('asks for a role', () => {
    expect(validatePerson(workspace(), emptyPersonForm())).toEqual({ role: expect.stringMatching(/^Give their role/) })
  })

  it('removes a person nothing refers to', () => {
    const state = workspace()
    expect(applies(state, removePersonOps(first(state))).people.people).toEqual([])
  })

  it('says which archived tasks keep the person as text', () => {
    const gone = 'Robin is removed from People, with their notes and leave.'
    expect(removalDescription({ label: 'Robin', archived: [] })).toBe(`${gone} Nothing else refers to them.`)
    expect(removalDescription({ label: 'Robin', archived: [{ key: 'B1', title: 'Logo', sprint: 7 }] })).toBe(`${gone} B1, archived in sprint 7, keeps “Robin” as text.`)
    expect(removalDescription({ label: 'Robin', archived: [{ key: 'B1', title: 'Logo', sprint: 6 }, { key: 'B2', title: 'Fonts', sprint: 6 }, { key: 'B4', title: 'Icons', sprint: 7 }] }))
      .toBe(`${gone} B1, B2 and B4, already archived, keep “Robin” as text.`)
  })
})

describe('leave', () => {
  it('adds, edits and removes ranges as the whole list, and Undo puts it back exactly', () => {
    const state = workspace()
    const p = first(state)
    const added = applies(state, saveLeaveOps(p, { start: '2026-12-20', end: '2026-12-31', note: 'Holiday' }, null))
    expect(first(added).ooo).toEqual([{ start: '2026-11-12', end: '2026-11-13', note: null }, { start: '2026-12-20', end: '2026-12-31', note: 'Holiday' }])
    expect(saveLeaveOps(first(added), leaveForm(first(added).ooo[1] as Person['ooo'][number]), 1)).toEqual([])
    const edited = applies(added, saveLeaveOps(first(added), { start: '2026-12-21', end: '2026-12-31', note: 'Holiday' }, 1))
    expect(first(edited).ooo[1]?.start).toBe('2026-12-21')
    const removed = applies(edited, removeLeaveOps(first(edited), 0))
    expect(first(removed).ooo.map(r => r.start)).toEqual(['2026-12-21'])
    expect(first(applies(removed, restoreLeaveOps(first(edited)))).ooo).toEqual(first(edited).ooo)
  })

  it('refuses a range that ends before it starts', () => {
    expect(validateLeave({ start: '2026-11-20', end: '2026-11-19', note: '' })).toEqual({ end: 'The last day cannot be before the first.' })
    expect(validateLeave(emptyLeaveForm())).toMatchObject({ start: expect.any(String), end: expect.any(String) })
  })
})

describe('the glossary', () => {
  it('adds, edits and removes a term, and Undo brings it back exactly', () => {
    const state = workspace()
    const added = applies(state, termOps(state, { ...emptyTermForm(), term: 'Hero', aliases: 'banner', meaning: 'The top of a page.', project: 'website' }, null, newId))
    const hero = added.glossary.terms.find(t => t.term === 'Hero')
    if (!hero) throw new Error('term')
    expect(hero).toMatchObject({ aliases: ['banner'], projectId: added.projects.website?.id })
    expect(termOps(added, termForm(added, hero), hero)).toEqual([])
    const edited = applies(added, termOps(added, { ...termForm(added, hero), meaning: 'The first thing on a page.' }, hero))
    const after = edited.glossary.terms.find(t => t.id === hero.id)
    if (!after) throw new Error('term')
    const removed = applies(edited, removeTermOps(after))
    expect(removed.glossary.terms.map(t => t.term)).toEqual(['CMS'])
    expect(applies(removed, restoreTermOps(edited, after)).glossary.terms.find(t => t.id === hero.id)).toEqual(after)
  })

  it('refuses a term already in the glossary, ignoring case', () => {
    const state = workspace()
    expect(validateTerm(state, { ...emptyTermForm(), term: 'cms', meaning: 'x' }, null).term).toMatch(/already in the glossary/)
    expect(validateTerm(state, emptyTermForm(), null)).toEqual({ term: 'Write the term.', meaning: 'Say what it means.' })
  })

  it('filters by term, alias or meaning, alphabetically', () => {
    const state = applies(workspace(), [{ type: 'term.upsert', term: 'API', meaning: 'How the pages are served.' }])
    expect(glossary(state).map(t => t.term)).toEqual(['API', 'CMS'])
    expect(glossary(state, 'edited').map(t => t.term)).toEqual(['CMS'])
  })
})
