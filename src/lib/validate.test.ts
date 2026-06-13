import { describe, it, expect } from 'vitest'
import { validateFile } from './validate'

describe('validateFile', () => {
  it('accepts a well-formed tasks file', () => {
    const good = { columns: [{ id: 'c1', name: 'Backlog', tasks: [] }] }
    expect(validateFile('tasks', good)).toBe(good)
  })

  it('rejects a non-object top level', () => {
    expect(() => validateFile('tasks', null)).toThrow(/malformed/)
    expect(() => validateFile('tasks', [])).toThrow(/not an object/)
  })

  it('throws (does not default) when a required container is missing', () => {
    // Critical: a missing "columns" must throw, not silently become [] —
    // otherwise the next auto-save would overwrite real remote data with an empty file.
    expect(() => validateFile('tasks', {})).toThrow(/"columns" to be an array/)
  })

  it('rejects a column without a tasks array', () => {
    expect(() => validateFile('tasks', { columns: [{ id: 'c1', name: 'X' }] }))
      .toThrow(/columns\[0\] is missing a "tasks" array/)
  })

  it('accepts focus with and without calendarEvents, rejects a bad calendarEvents', () => {
    expect(() => validateFile('focus', { sections: [] })).not.toThrow()
    expect(() => validateFile('focus', { sections: [], calendarEvents: [] })).not.toThrow()
    expect(() => validateFile('focus', { sections: [], calendarEvents: 'nope' }))
      .toThrow(/"calendarEvents" to be an array/)
  })

  it('requires the four project child arrays', () => {
    const base = { id: 'p1', timeline: [], openQuestions: [], sections: [], models: null }
    expect(() => validateFile('projects', { projects: [base] })).not.toThrow()
    const { openQuestions, ...missingOQ } = base
    void openQuestions
    expect(() => validateFile('projects', { projects: [missingOQ] }))
      .toThrow(/projects\[0\] is missing a "openQuestions" array/)
  })

  it('allows project models to be an array or null but not a string', () => {
    const mk = (models: unknown) => ({
      projects: [{ id: 'p1', timeline: [], openQuestions: [], sections: [], models }],
    })
    expect(() => validateFile('projects', mk([]))).not.toThrow()
    expect(() => validateFile('projects', mk(null))).not.toThrow()
    expect(() => validateFile('projects', mk('x'))).toThrow(/models must be an array or null/)
  })

  it('validates memory containers and referenceFiles object', () => {
    const good = {
      people: [], terms: [], projects: [], recurringResponsibilities: [],
      referenceFiles: {},
    }
    expect(() => validateFile('memory', good)).not.toThrow()
    expect(() => validateFile('memory', { ...good, referenceFiles: [] }))
      .toThrow(/"referenceFiles" to be an object/)
  })

  it('validates settings numeric fields', () => {
    const good = { oneOnOnePeople: [], autoSaveDebounceMs: 2000, pollIntervalMs: 30000 }
    expect(() => validateFile('settings', good)).not.toThrow()
    expect(() => validateFile('settings', { ...good, autoSaveDebounceMs: '2000' }))
      .toThrow(/"autoSaveDebounceMs" to be a number/)
  })
})
