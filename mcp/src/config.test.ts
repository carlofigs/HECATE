import { describe, it, expect } from 'vitest'
import { loadConfig, ConfigError } from './config'

const full = {
  HECATE_GITHUB_TOKEN: 'ghp_test',
  HECATE_OWNER: 'carlofigs',
  HECATE_REPO: 'HECATE_Data',
  HECATE_WORKSPACE: 'kickball',
}

describe('loadConfig', () => {
  it('reads a complete environment', () => {
    expect(loadConfig(full)).toEqual({
      token: 'ghp_test', owner: 'carlofigs', repo: 'HECATE_Data', workspace: 'kickball',
    })
  })

  it('trims surrounding whitespace', () => {
    const cfg = loadConfig({ ...full, HECATE_WORKSPACE: '  kickball  ' })
    expect(cfg.workspace).toBe('kickball')
  })

  it.each(Object.keys(full))('throws when %s is absent', key => {
    const env = { ...full }
    delete (env as Record<string, string>)[key]
    expect(() => loadConfig(env)).toThrow(ConfigError)
  })

  it('treats an empty or whitespace-only value as missing', () => {
    expect(() => loadConfig({ ...full, HECATE_OWNER: '   ' })).toThrow(ConfigError)
  })

  // A server that reports one missing variable per restart wastes a round trip
  // each time; naming them all at once is the difference between one fix and four.
  it('names every missing variable at once, not just the first', () => {
    try {
      loadConfig({ HECATE_OWNER: 'carlofigs' })
      expect.unreachable('should have thrown')
    } catch (err) {
      const msg = (err as ConfigError).message
      expect(msg).toContain('HECATE_GITHUB_TOKEN')
      expect(msg).toContain('HECATE_REPO')
      expect(msg).toContain('HECATE_WORKSPACE')
      expect(msg).not.toContain('HECATE_OWNER,')
    }
  })
})
