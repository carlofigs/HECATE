import { describe, expect, it } from 'vitest'
import { CURRENT_VERSION, FILE_KINDS, type FileKind } from './kinds.ts'
import {
  FileValidationError, FutureSchemaError, UnversionedFileError, migrate, migrations,
  parseActivityLog, parseFile, safeParseFile, serializeActivityEntry, serializeFile, stamp,
} from './versioning.ts'
import { pathFor, type JsonFileKind } from './files.ts'
import { validFile, validFiles } from './__fixtures__/valid.ts'

const JSON_KINDS = FILE_KINDS.filter((k): k is JsonFileKind => k !== 'activityEntry' && k !== 'meetingFrontmatter')

describe('every kind', () => {
  it('has a migration step registered for every version below current', () => {
    for (const kind of FILE_KINDS) {
      for (let v = 1; v < CURRENT_VERSION[kind]; v++) {
        expect(migrations[kind][v], `${kind} v${v} → v${v + 1}`).toBeTypeOf('function')
      }
    }
  })

  it.each(FILE_KINDS)('%s: the fixture parses', kind => {
    expect(() => parseFile(kind, validFile(kind))).not.toThrow()
  })

  it.each(JSON_KINDS)('%s: serialises and reads back identically, in a stable byte form', kind => {
    const data = parseFile(kind, validFile(kind))
    const text = serializeFile(kind, data)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.startsWith('{\n  "schemaVersion": 1,')).toBe(true)
    expect(parseFile(kind, JSON.parse(text))).toEqual(data)
    expect(serializeFile(kind, parseFile(kind, JSON.parse(text)))).toBe(text)
  })

  it.each(FILE_KINDS)('%s: rejects an unknown key (schemas are strict)', kind => {
    expect(() => parseFile(kind, { ...validFile(kind), surprise: true })).toThrow(FileValidationError)
  })
})

describe('the version guard', () => {
  it('refuses a file with no schemaVersion as a v1 file', () => {
    const { schemaVersion: _drop, ...v1Shaped } = validFile('tasks')
    expect(() => parseFile('tasks', v1Shaped)).toThrow(UnversionedFileError)
    expect(() => parseFile('tasks', v1Shaped)).toThrow(/migrate-v1/)
  })

  it('refuses a file from a newer build, naming both versions', () => {
    const err = (() => {
      try { parseFile('focusWeek', { ...validFile('focusWeek'), schemaVersion: 99 }) } catch (e) { return e }
      return null
    })()
    expect(err).toBeInstanceOf(FutureSchemaError)
    expect((err as FutureSchemaError).fileVersion).toBe(99)
    expect((err as FutureSchemaError).supportedVersion).toBe(1)
  })

  it('refuses a malformed version', () => {
    expect(() => parseFile('tasks', { ...validFile('tasks'), schemaVersion: '1' })).toThrow(RangeError)
    expect(() => parseFile('tasks', { ...validFile('tasks'), schemaVersion: 0 })).toThrow(RangeError)
  })

  it('passes non-objects through for validation to reject', () => {
    expect(migrate('tasks', [])).toEqual([])
    expect(() => parseFile('tasks', [])).toThrow(FileValidationError)
    expect(() => parseFile('tasks', null)).toThrow(FileValidationError)
  })

  it('safeParseFile reports instead of throwing', () => {
    expect(safeParseFile('glossary', validFile('glossary')).ok).toBe(true)
    const bad = safeParseFile('glossary', { schemaVersion: 1 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toBeInstanceOf(FileValidationError)
  })

  it('stamp adds the current version and validates', () => {
    const { schemaVersion: _v, ...rest } = validFile('glossary')
    expect(stamp('glossary', parseFile('glossary', validFiles.glossary)).schemaVersion).toBe(1)
    expect(() => stamp('glossary', rest as never)).not.toThrow()
  })
})

/** Break one thing in a valid fixture and expect a readable rejection at that path. */
function rejects(kind: FileKind, mutate: (f: Record<string, any>) => void, path: string, message?: RegExp): void {
  const file = validFile(kind)
  mutate(file)
  const result = safeParseFile(kind, file)
  expect(result.ok, `${kind}: expected a rejection at ${path}`).toBe(false)
  if (result.ok) return
  const error = result.error as FileValidationError
  expect(error).toBeInstanceOf(FileValidationError)
  const paths = error.issues.map(i => i.path.join('.'))
  expect(paths, error.message).toContain(path)
  if (message) expect(error.message).toMatch(message)
}

describe('targeted rejections', () => {
  it('tasks: keys are allocated, unique, and in the right series', () => {
    rejects('tasks', f => { f.nextKey.A = 3 }, 'tasks.2.key', /not below nextKey\.A/)
    rejects('tasks', f => { f.tasks[1].key = 'A1' }, 'tasks.1', /Duplicate task key/)
    rejects('tasks', f => { f.tasks[0].key = 'B1'; f.tasks[3].key = 'A1' }, 'tasks.0.kind', /B series/)
    rejects('tasks', f => { f.tasks[0].waitingOn = { personId: null, text: 'Someone' } }, 'tasks.0.waitingOn')
    rejects('tasks', f => { f.tasks[0].dependsOn = ['A1'] }, 'tasks.0.dependsOn', /itself/)
    rejects('tasks', f => { f.tasks[1].legacyIds = ['x']; f.tasks[2].legacyIds = ['x'] }, 'tasks.1', /legacy id/)
    rejects('tasks', f => { f.tasks[0].key = 'T-001' }, 'tasks.0.key')
    rejects('tasks', f => { f.tasks[0].title = ' padded' }, 'tasks.0.title')
    rejects('tasks', f => { f.tasks[0].urgency = 'medium' }, 'tasks.0.urgency')
    rejects('tasks', f => { f.tasks[0].due = '2027-02-29' }, 'tasks.0.due')
  })

  it('focusWeek: Monday-anchored, in-week, private entries stay private', () => {
    rejects('focusWeek', f => { f.weekOf = '2026-11-03' }, 'weekOf', /not a Monday/)
    rejects('focusWeek', f => { f.weekOf = 'next monday' }, 'weekOf')
    rejects('tasks', f => { f.tasks[0].key = 'C9' }, 'tasks.0.key')
    rejects('focusWeek', f => { f.schedule[0].date = '2026-11-09' }, 'schedule.0.date', /outside the week/)
    rejects('focusWeek', f => { f.schedule[2].title = 'Dentist' }, 'schedule.2.title', /personal entry/)
    rejects('focusWeek', f => { f.schedule[2].keys = ['A1'] }, 'schedule.2.personal')
    rejects('focusWeek', f => { f.schedule[0].title = null }, 'schedule.0.title')
    rejects('focusWeek', f => { f.schedule[0].end = '09:00' }, 'schedule.0.end', /before start/)
    rejects('focusWeek', f => { f.schedule[0].start = '25:00' }, 'schedule.0.start')
    rejects('focusWeek', f => { f.days[0].outcomes[0].planItemId = f.schedule[0].id }, 'days.0.outcomes.0.planItemId')
    rejects('focusWeek', f => { f.priorities[1].id = f.priorities[0].id }, 'priorities.1', /Duplicate id/)
    rejects('focusWeek', f => { f.priorities[0].tier = 'top' }, 'priorities.0.tier')
    rejects('focusWeek', f => { f.days.push({ ...f.days[0], plan: [], outcomes: [] }) }, 'days.1', /Duplicate day/)
  })

  it('workspace: real zone, required status categories, unique ids', () => {
    rejects('workspace', f => { f.timezone = 'Sydney' }, 'timezone')
    rejects('workspace', f => { f.statuses = f.statuses.filter((s: { category: string }) => s.category !== 'dropped') }, 'statuses', /"dropped"/)
    rejects('workspace', f => { f.tags.push({ id: 'admin', label: null }) }, 'tags.2', /Duplicate tag id/)
    rejects('workspace', f => { f.workdays = [1, 1] }, 'workdays.1')
    rejects('workspace', f => { f.workdays = [0] }, 'workdays.0')
  })

  it('project, sprint, people, glossary, activity', () => {
    rejects('project', f => { f.openQuestions[1].n = 1 }, 'openQuestions.1', /question number/)
    rejects('project', f => { f.openQuestions[1].resolution = null }, 'openQuestions.1.resolution')
    rejects('project', f => { f.slug = 'Score Card' }, 'slug')
    rejects('sprint', f => { f.end = '2026-10-01' }, 'end', /before start/)
    rejects('sprint', f => { f.carried = ['A3'] }, 'carried.1', /across done, dropped and carried/)
    rejects('people', f => { f.people[1].ooo[0].end = '2026-11-01' }, 'people.1.ooo.0.end')
    rejects('glossary', f => { f.terms.push({ ...f.terms[0], id: f.people?.[0] ?? '01KBZZZZZZZZZZZZZZZZZZZZZZ', term: 'bau' }) }, 'terms.1', /Duplicate term/)
    rejects('activityEntry', f => { f.delta = 'x'.repeat(201) }, 'delta')
    rejects('activityEntry', f => { f.actor = 'robot' }, 'actor')
  })
})

describe('activity log (JSONL)', () => {
  it('appends one line per entry and parses the whole file back', () => {
    const entry = parseFile('activityEntry', validFile('activityEntry'))
    const line = serializeActivityEntry(entry)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(parseActivityLog(line + '\n' + line)).toEqual([entry, entry])
  })

  it('names the line that is wrong', () => {
    const good = serializeActivityEntry(parseFile('activityEntry', validFile('activityEntry')))
    expect(() => parseActivityLog(good + '{not json}\n')).toThrow(/line 2 is not valid JSON/)
    expect(() => parseActivityLog(good + good.replace('"claude"', '"robot"'))).toThrow(/line 2/)
  })
})

describe('pathFor', () => {
  it('builds workspace-relative paths', () => {
    expect(pathFor('tasks')).toBe('tasks.json')
    expect(pathFor('focusWeek', { weekOf: '2026-11-02' })).toBe('focus/2026-11-02.json')
    expect(pathFor('keepInMind')).toBe('focus/keep-in-mind.json')
    expect(pathFor('project', { slug: 'scorecard' })).toBe('projects/scorecard.json')
    expect(pathFor('sprint', { n: 7 })).toBe('sprints/7.json')
    expect(pathFor('activityEntry', { week: '2026-W45' })).toBe('activity/2026-W45.jsonl')
    expect(pathFor('meetingFrontmatter', { date: '2026-11-04', slug: 'check-in' })).toBe('meetings/2026-11-04-check-in.md')
  })

  it('cannot be steered outside the workspace', () => {
    expect(() => pathFor('project', { slug: '../../secrets' })).toThrow()
    expect(() => pathFor('focusWeek', { weekOf: '../x' })).toThrow()
    expect(() => pathFor('sprint', { n: 1.5 })).toThrow(RangeError)
    expect(() => pathFor('activityEntry', { week: '../W1' })).toThrow(RangeError)
  })
})
