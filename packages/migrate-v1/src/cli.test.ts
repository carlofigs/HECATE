import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stateFromFiles } from '@hecate/core'
import { findWorkspaces, main, type CliIO } from './cli.ts'

const AT = '2026-11-05T00:00:00.000Z'
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'migrate-v1-'))
  cpSync(new URL('./__fixtures__/v1/', import.meta.url), join(root, 'data'), { recursive: true })
  // Not workspaces: a hidden directory and one without tasks.json.
  cpSync(join(root, 'data', 'club'), join(root, 'data', '.git'), { recursive: true })
  cpSync(new URL('./__fixtures__/v1/club/settings.json', import.meta.url), join(root, 'data', 'scripts', 'settings.json'))
  writeFileSync(join(root, 'config.json'), JSON.stringify({ workspaces: { 'old-job': { policy: 'sanitised', replacements: { 'Jordan Park': 'Analyst' } } } }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function run(...args: string[]): { code: number; stdout: string; stderr: string } {
  let stdout = ''
  let stderr = ''
  const io: CliIO = { stdout: t => { stdout += t }, stderr: t => { stderr += t }, cwd: root, now: () => AT }
  const code = main(args, io)
  return { code, stdout, stderr }
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

describe('migrate-v1 CLI', () => {
  it('finds workspaces: directories with a tasks.json, not hidden', () => {
    expect(findWorkspaces(join(root, 'data'))).toEqual(['club', 'old-job'])
  })

  it('a dry run prints the report, writes nothing and exits 0', () => {
    const { code, stdout } = run('--data', 'data', '--config', 'config.json')
    expect(code).toBe(0)
    expect(stdout).toContain('2 workspaces · 2 ready')
    expect(stdout).toContain('Run at 2026-11-05T00:00:00.000Z')
    expect(readdirSync(root).sort()).toEqual(['config.json', 'data'])
  })

  it('--out writes trees that load, and refuses to write over them', () => {
    expect(run('--data', 'data', '--config', 'config.json', '--out', 'v2').code).toBe(0)
    for (const ws of ['club', 'old-job']) {
      const dir = join(root, 'v2', ws)
      const files = Object.fromEntries(walk(dir).map(f => [relative(dir, f), readFileSync(f, 'utf8')]))
      expect(() => stateFromFiles(files)).not.toThrow()
    }
    const again = run('--data', 'data', '--config', 'config.json', '--out', 'v2')
    expect(again.code).toBe(1)
    expect(again.stderr).toContain('is not empty')
  })

  it('--workspace limits the run; --names lists possible names on stderr only', () => {
    const { code, stdout, stderr } = run('--data', 'data', '--config', 'config.json', '--workspace', 'old-job', '--names')
    expect(code).toBe(0)
    expect(stdout).toContain('1 workspace · 1 ready')
    expect(stderr).toContain('Possible names left in old-job (0)')
  })

  it('exits 1 on an unaccounted field and writes nothing', () => {
    const path = join(root, 'data', 'club', 'settings.json')
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), fontSize: 14 }))
    const { code, stdout, stderr } = run('--data', 'data', '--out', 'v2')
    expect(code).toBe(1)
    expect(stdout).toContain('`settings.fontSize`')
    expect(stderr).toContain('Nothing written')
    expect(readdirSync(root)).not.toContain('v2')
  })

  it('exits 2 on a usage error', () => {
    expect(run().code).toBe(2)
    expect(run('--data', 'missing').code).toBe(2)
    expect(run('--data', 'data', '--workspace', 'nope').code).toBe(2)
    expect(run('--data', 'data', '--bogus').code).toBe(2)
    writeFileSync(join(root, 'bad.json'), JSON.stringify({ workspaces: { club: { policy: 'secret' } } }))
    expect(run('--data', 'data', '--config', 'bad.json').code).toBe(2)
  })
})
