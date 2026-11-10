import { describe, expect, it } from 'vitest'
import { isoDate } from '../dates.ts'
import { baseState, ok, run } from '../__fixtures__/workspace.ts'
import { peopleList, personView } from './people.ts'

const TODAY = isoDate('2026-11-05')

/** Sam (B1 waits on Sam), plus Alex with leave and a scorecard cutoff naming Sam. */
function people() {
  const { state, samId } = baseState()
  const withAlex = ok(run(state, [
    { type: 'person.upsert', name: 'Alex', role: 'Data engineer', ooo: [{ start: '2026-12-20', end: '2026-12-31' }, { start: '2026-11-10', end: '2026-11-12', note: 'Conference' }] },
    { type: 'project.update', slug: 'scorecard', patch: { cutoffs: [{ date: '2026-11-19', personId: samId, who: 'Sam', what: 'Sign-off' }] } },
  ])).state
  const alexId = withAlex.people.people.find(p => p.name === 'Alex')?.id ?? ''
  return { state: withAlex, samId, alexId }
}

describe('peopleList', () => {
  it('lists people by label, with leave coming up and what waits on them', () => {
    const { state } = people()
    expect(peopleList(state, TODAY).map(r => [r.label, r.role, r.waiting, r.away?.start ?? null])).toEqual([
      ['Alex', 'Data engineer', 0, '2026-11-10'],
      ['Sam', 'Product manager', 1, null],
    ])
  })
})

describe('personView', () => {
  it('gathers what links to a person, and says the engine would refuse to remove them', () => {
    const { state, samId } = people()
    const view = personView(state, samId, TODAY)
    expect(view?.label).toBe('Sam')
    expect(view?.waitingOn.map(t => t.key)).toEqual(['B1'])
    expect(view?.cutoffs).toMatchObject([{ projectSlug: 'scorecard', what: 'Sign-off', date: '2026-11-19' }])
    expect(view?.removable).toEqual({ ok: false, reason: expect.stringMatching(/still referenced by .*B1.*scorecard/) })
  })

  it('sorts leave and marks what is current or past, and lets an unlinked person go', () => {
    const { state, alexId } = people()
    const view = personView(state, alexId, isoDate('2026-11-11'))
    expect(view?.leave.map(r => [r.start, r.current, r.past])).toEqual([['2026-11-10', true, false], ['2026-12-20', false, false]])
    expect(view?.removable).toEqual({ ok: true })
    expect(personView(state, alexId, isoDate('2026-11-13'))?.leave[0]?.past).toBe(true)
  })

  it('is null for an unknown id', () => {
    expect(personView(people().state, '01KQ0000000000000000000000', TODAY)).toBeNull()
  })
})
