import { describe, expect, it } from 'vitest'
import { checkWorkspace, findPossibleNames } from './check.ts'
import {
  filesFromState, parseMeetingFile, serializeMeetingFile, stateFromFiles, WorkspaceLoadError, type WorkspaceState,
} from './state.ts'
import { baseState, ok, run } from './__fixtures__/workspace.ts'

describe('files ↔ state', () => {
  it('round-trips a populated workspace', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [
      { type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft', keys: ['A1'] }] },
      { type: 'sprint.start', goal: 'Ship.' },
      { type: 'reference.put', name: 'style-guide', content: '# Style\n\nShort sentences.' },
      { type: 'meeting.save', date: '2026-11-05', slug: 'check-in', title: 'Check-in', input: 'notes', people: [samId], body: 'Notes.' },
    ]))
    const files = filesFromState(r.state)
    expect(Object.keys(files).sort()).toEqual([
      'focus/2026-11-02.json', 'focus/keep-in-mind.json', 'glossary.json', 'meetings/2026-11-05-check-in.md', 'people.json',
      'profile.json', 'projects/scorecard.json', 'references/style-guide.md', 'sprints/7.json', 'tasks.json', 'workspace.json',
    ])
    expect(stateFromFiles(files)).toEqual(r.state)
  })

  it('ignores activity logs, which are not state', () => {
    const files = { ...filesFromState(baseState().state), 'activity/2026-W45.jsonl': '{"not":"parsed here"}\n' }
    expect(() => stateFromFiles(files)).not.toThrow()
  })

  it('names every problem: invalid, mismatched, unknown and missing files', () => {
    const files = filesFromState(baseState().state)
    delete files['people.json']
    files['tasks.json'] = '{ not json'
    files['projects/other.json'] = files['projects/scorecard.json'] as string
    files['notes/random.txt'] = 'hello'
    try {
      stateFromFiles(files)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceLoadError)
      const problems = (error as WorkspaceLoadError).problems.map(p => p.path).sort()
      expect(problems).toEqual(['notes/random.txt', 'people.json', 'projects/other.json', 'tasks.json'])
    }
  })
})

describe('meeting files', () => {
  it('are JSON front matter between --- fences, then the markdown body', () => {
    const { state, samId } = baseState()
    const r = ok(run(state, [{ type: 'meeting.save', date: '2026-11-05', slug: 'a', title: 'A', input: 'notes', people: [samId], body: '## Notes\n\nText.' }]))
    const meeting = r.state.meetings['meetings/2026-11-05-a.md']
    if (!meeting) throw new Error('missing meeting')
    const text = serializeMeetingFile(meeting)
    expect(text.startsWith('---\n{\n  "schemaVersion": 1,')).toBe(true)
    expect(text.endsWith('---\n\n## Notes\n\nText.\n')).toBe(true)
    expect(parseMeetingFile(text)).toEqual(meeting)
  })

  it('reject a file without valid front matter', () => {
    expect(() => parseMeetingFile('# No front matter')).toThrow(/front matter fence/)
    expect(() => parseMeetingFile('---\n{"a":\n---\nbody')).toThrow(/not valid JSON/)
    expect(() => parseMeetingFile('---\n{}\nbody')).toThrow(/not closed/)
  })
})

describe('checkWorkspace', () => {
  it('passes a workspace built through ops', () => {
    expect(checkWorkspace(baseState().state)).toEqual([])
  })

  it('reports cross-file problems a single schema cannot see', () => {
    const broken = JSON.parse(JSON.stringify(baseState().state)) as WorkspaceState
    const [a1, b1, a2] = broken.tasks.tasks
    if (!a1 || !b1 || !a2) throw new Error('fixture changed')
    a1.status = 'someday'
    b1.tags = ['unknown-tag']
    b1.waitingOn = { personId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' as never, text: null }
    a2.completedAt = '2026-11-01T00:00:00.000Z'
    a2.dependsOn = ['A99' as never]
    const codes = checkWorkspace(broken).map(i => i.code).sort()
    expect(codes).toEqual(['completed-at', 'unknown-key', 'unknown-person', 'unknown-status', 'unknown-tag'])
  })

  it('reports an archived task that waits on a person who does not exist', () => {
    const { state } = baseState()
    const dropped = ok(run(state, [{ type: 'task.drop', task: 'B1' }], { at: '2026-11-09T22:00:00.000Z' })).state
    const closed = ok(run(dropped, [{ type: 'sprint.close', n: 7 }], { at: '2026-11-10T23:00:00.000Z' })).state
    expect(checkWorkspace(closed)).toEqual([])
    const broken = JSON.parse(JSON.stringify(closed)) as WorkspaceState
    broken.people.people = []
    expect(checkWorkspace(broken)).toEqual([expect.objectContaining({ code: 'unknown-person', path: 'sprints/7.json', message: 'B1 (archived) waits on a person who does not exist' })])
  })

  it('applies the sanitised policy to people', () => {
    const broken = JSON.parse(JSON.stringify(baseState('sanitised').state)) as WorkspaceState
    const sam = broken.people.people[0]
    if (!sam) throw new Error('fixture changed')
    sam.name = 'Sam'
    expect(checkWorkspace(broken)).toEqual([expect.objectContaining({ code: 'name-in-sanitised', path: 'people.json' })])
  })
})

describe('findPossibleNames', () => {
  it('flags capitalised pairs that are not known terms, projects or common words', () => {
    const { state } = baseState()
    expect(findPossibleNames(state, [
      'Feedback from Jane Doe on the Scorecard',
      'Sprint Review on Tuesday',
      'Ask the Product Manager',
      'Notes from Alex Lee and Jane Doe',
    ])).toEqual(['Jane Doe', 'Alex Lee'])
  })
})
