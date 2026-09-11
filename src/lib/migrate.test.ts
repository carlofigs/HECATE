import { describe, it, expect } from 'vitest'
import {
  migrateFile,
  readVersion,
  FutureSchemaError,
  CURRENT_SCHEMA_VERSION,
} from '@/lib/migrate'

describe('readVersion', () => {
  it('reads an explicit version', () => {
    expect(readVersion({ schemaVersion: 3 })).toBe(3)
  })

  it('treats a missing field as v1 — files predating versioning are that shape', () => {
    expect(readVersion({ columns: [] })).toBe(1)
  })

  it.each([
    ['a string', { schemaVersion: '2' }],
    ['a float', { schemaVersion: 1.5 }],
    ['zero', { schemaVersion: 0 }],
    ['negative', { schemaVersion: -1 }],
    ['null', { schemaVersion: null }],
  ])('falls back to v1 for %s rather than trusting it', (_label, data) => {
    expect(readVersion(data)).toBe(1)
  })
})

describe('migrateFile', () => {
  it('stamps the current version onto an unversioned file', () => {
    const out = migrateFile('tasks', { columns: [] }) as Record<string, unknown>
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(out.columns).toEqual([])
  })

  it('preserves every existing field', () => {
    const input = { sections: [{ id: 'today' }], weekOf: '2026-09-14', sprintLabel: 'Week 1' }
    const out = migrateFile('focus', input) as Record<string, unknown>
    expect(out.sections).toEqual([{ id: 'today' }])
    expect(out.weekOf).toBe('2026-09-14')
    expect(out.sprintLabel).toBe('Week 1')
  })

  it('does not mutate the input', () => {
    const input = { columns: [] }
    migrateFile('tasks', input)
    expect(input).not.toHaveProperty('schemaVersion')
  })

  it('is a no-op for a file already at the current version', () => {
    const input = { columns: [], schemaVersion: CURRENT_SCHEMA_VERSION }
    expect(migrateFile('tasks', input)).toEqual(input)
  })

  // The case that protects data once more than one writer exists.
  it('refuses a file written by a newer build rather than misreading it', () => {
    const future = { columns: [], schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(() => migrateFile('tasks', future)).toThrow(FutureSchemaError)
  })

  it('names the versions in the error so the message is actionable', () => {
    const future = { columns: [], schemaVersion: CURRENT_SCHEMA_VERSION + 5 }
    try {
      migrateFile('tasks', future)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FutureSchemaError)
      const e = err as FutureSchemaError
      expect(e.fileVersion).toBe(CURRENT_SCHEMA_VERSION + 5)
      expect(e.supportedVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(e.message).toContain('tasks.json')
    }
  })

  it('passes non-objects through for validateFile to reject with a clearer message', () => {
    expect(migrateFile('tasks', null)).toBeNull()
    expect(migrateFile('tasks', [])).toEqual([])
    expect(migrateFile('tasks', 'nope')).toBe('nope')
  })
})
