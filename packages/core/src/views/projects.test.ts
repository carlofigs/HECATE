import { describe, expect, it } from 'vitest'
import { isoDate } from '../dates.ts'
import { baseState, ok, run } from '../__fixtures__/workspace.ts'
import { projectList, projectView } from './projects.ts'

const d = isoDate
const TODAY = d('2026-11-05')

/** baseState's "scorecard" (A1 linked), plus a second live project and a closed one. */
function projects() {
  const { state } = baseState()
  return ok(run(state, [
    {
      type: 'project.update', slug: 'scorecard', patch: {
        status: 'blocked',
        deadlines: [{ date: '2026-11-02', title: 'Kick-off', hard: false }, { date: '2026-11-20', title: 'Review', hard: true }, { date: '2026-11-12', title: 'Draft due' }],
        openQuestions: [{ n: 1, question: 'Which targets?', blocker: true }, { n: 2, question: 'Who signs off?' }, { n: 3, question: 'Old?', status: 'deferred' }],
      },
    },
    { type: 'project.create', slug: 'offsite', name: 'Team offsite', status: 'active', deadlines: [{ date: '2026-10-30', title: 'Venue booked' }] },
    { type: 'project.create', slug: 'archive', name: 'Archive', status: 'done' },
    { type: 'task.add', kind: 'action', title: 'Book the venue', project: 'offsite' },
    { type: 'task.add', kind: 'action', title: 'Send invites', project: 'offsite', status: 'done' },
  ])).state
}

describe('projectList', () => {
  it('puts live projects first by status, then closed ones, each with what needs attention', () => {
    const rows = projectList(projects(), TODAY)
    expect(rows.map(r => [r.slug, r.status, r.live])).toEqual([['offsite', 'active', true], ['scorecard', 'blocked', true], ['archive', 'done', false]])
    const scorecard = rows[1]
    expect(scorecard).toMatchObject({ openTasks: 1, openQuestions: 2, blockers: 1, nextDeadline: { date: '2026-11-12', title: 'Draft due', hard: false, overdue: false } })
    // Only an overdue deadline left: it is still the one to show, marked overdue.
    expect(rows[0]).toMatchObject({ openTasks: 1, nextDeadline: { title: 'Venue booked', overdue: true } })
    expect(rows[2]?.nextDeadline).toBeNull()
  })
})

describe('projectView', () => {
  it('splits linked tasks into open, finished on the board, and archived by sprint', () => {
    const state = projects()
    const view = projectView(state, 'offsite', TODAY)
    expect(view?.tasks.open.map(t => t.title)).toEqual(['Book the venue'])
    expect(view?.tasks.finished.map(t => t.title)).toEqual(['Send invites'])
    expect(view?.tasks.archived).toEqual([])

    const closed = ok(run(state, [{ type: 'sprint.close', n: 7 }])).state
    const after = projectView(closed, 'offsite', TODAY)
    expect(after?.tasks.finished).toEqual([])
    expect(after?.tasks.archived).toMatchObject([{ title: 'Send invites', where: 'archived', sprint: 7 }])
    expect(after?.tasks.open.map(t => t.title)).toEqual(['Book the venue'])
  })

  it('orders deadlines by date and marks the overdue ones', () => {
    const view = projectView(projects(), 'scorecard', TODAY)
    expect(view?.deadlines.map(x => [x.title, x.overdue])).toEqual([['Kick-off', true], ['Draft due', false], ['Review', false]])
    expect(view?.live).toBe(true)
  })

  it('is null for a slug with no project', () => {
    expect(projectView(projects(), 'nope', TODAY)).toBeNull()
  })
})
