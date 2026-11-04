import { describe, expect, it } from 'vitest'
import { checkPolicy } from './policy.ts'
import { parseFile } from './versioning.ts'
import { validFile } from './__fixtures__/valid.ts'

describe('checkPolicy', () => {
  const people = parseFile('people', validFile('people'))
  const meeting = parseFile('meetingFrontmatter', validFile('meetingFrontmatter'))

  it('allows names and meetings in an open workspace', () => {
    expect(checkPolicy('people', people, 'open')).toEqual([])
    expect(checkPolicy('meetingFrontmatter', meeting, 'open')).toEqual([])
  })

  it('flags names and aliases in a sanitised workspace', () => {
    const issues = checkPolicy('people', people, 'sanitised')
    expect(issues.map(i => [i.code, i.path.join('.')])).toEqual([
      ['name-in-sanitised', 'people.0.name'],
      ['name-in-sanitised', 'people.1.name'],
      ['name-in-sanitised', 'people.1.aliases'],
    ])
    expect(issues[0]?.message).toContain('Analyst')
  })

  it('accepts role-only people in a sanitised workspace', () => {
    const roles = { ...people, people: people.people.map(p => ({ ...p, name: null, aliases: [] })) }
    expect(checkPolicy('people', roles, 'sanitised')).toEqual([])
  })

  it('refuses meeting notes in a sanitised workspace', () => {
    expect(checkPolicy('meetingFrontmatter', meeting, 'sanitised')).toMatchObject([{ code: 'meeting-in-sanitised', severity: 'error' }])
  })

  it('has nothing to say about other kinds', () => {
    expect(checkPolicy('tasks', parseFile('tasks', validFile('tasks')), 'sanitised')).toEqual([])
  })
})
