import { describe, expect, it } from 'vitest'
import { pickWorkspace } from './workspace.ts'

const list = (dirs: [string, boolean][], fallback: string | null = null) => ({
  workspaces: dirs.map(([dir, hidden]) => ({ dir, hidden, name: null, policy: null })),
  default: fallback,
})

describe('pickWorkspace', () => {
  it('prefers the remembered workspace while it exists', () => {
    expect(pickWorkspace(list([['a', false], ['b', false]], 'a'), 'b')).toBe('b')
    expect(pickWorkspace(list([['a', false], ['b', false]], 'a'), 'gone')).toBe('a')
  })

  it('falls back to the default, then the first visible workspace', () => {
    expect(pickWorkspace(list([['_old', true], ['b', false]]), null)).toBe('b')
    expect(pickWorkspace(list([['_old', true], ['b', false]], 'missing'), null)).toBe('b')
    expect(pickWorkspace(list([['_old', true]]), null)).toBe('_old')
    expect(pickWorkspace(list([]), null)).toBeNull()
  })
})
