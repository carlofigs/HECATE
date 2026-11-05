/**
 * The skills are prompts, so these checks keep them honest against the code
 * they drive: every tool and op they name exists, their frontmatter is what
 * claude.ai and Claude Code accept, nothing personal or v1-shaped slips in,
 * and the upload zips are laid out as claude.ai expects.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'
import { OP_TYPES } from '@hecate/core'
import { packageSkills } from '../scripts/package-skills.ts'

const SKILLS_DIR = new URL('../skills/', import.meta.url).pathname
const SERVER = new URL('../../apps/worker/src/mcp/server.ts', import.meta.url).pathname
const skills = readdirSync(SKILLS_DIR).sort()
const read = (skill: string): string => readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8')

/** The YAML frontmatter's name and description (both single-line in these files). */
function frontmatter(text: string): { name?: string; description?: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!m) return { body: text }
  const field = (key: string): string | undefined => {
    const line = (m[1] as string).split('\n').find(l => l.startsWith(`${key}:`))
    if (!line) return undefined
    const value = line.slice(key.length + 1).trim()
    return value.startsWith('"') ? (JSON.parse(value) as string) : value
  }
  return { name: field('name'), description: field('description'), body: m[2] as string }
}

const TOOLS = new Set([...readFileSync(SERVER, 'utf8').matchAll(/registerTool\('([a-z_]+)'/g)].map(m => m[1] as string))

describe('the skills', () => {
  it('are the three ported skills', () => {
    expect(skills).toEqual(['hecate-focus', 'hecate-log', 'hecate-meeting'])
    expect(TOOLS.size).toBe(9)
  })

  it.each(skills)('%s has frontmatter claude.ai and Claude Code accept', skill => {
    const { name, description, body } = frontmatter(read(skill))
    expect(name).toBe(skill)
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect((name ?? '').length).toBeLessThanOrEqual(64)
    expect((description ?? '').length).toBeGreaterThan(50)
    expect((description ?? '').length).toBeLessThanOrEqual(1024)
    expect(description).toMatch(/HECATE/)
    expect(description).toMatch(/Use when/)
    expect(body.trim().length).toBeGreaterThan(500)
  })

  it.each(skills)('%s names only tools the MCP server has', skill => {
    const named = [...read(skill).matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(m => m[1] as string)
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter(t => !TOOLS.has(t))).toEqual([])
  })

  it.each(skills)('%s names only ops the engine accepts', skill => {
    const ops = new Set<string>(OP_TYPES)
    const named = [...read(skill).matchAll(/`((?:task|focus|keepInMind|project|sprint|person|term|meeting|activity|reference|workspace|profile)\.[a-zA-Z]+)`/g)].map(m => m[1] as string)
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter(op => !ops.has(op))).toEqual([])
  })

  it.each(skills)('%s writes only through apply_ops, and carries nothing personal or v1-shaped', skill => {
    const text = read(skill)
    expect(text).toContain('`apply_ops`')
    for (const v1 of ['TASKS.md', 'FOCUS.md', 'UPDATES.md', 'CLAUDE.md', 'PROJECTS.md', 'calendar.txt']) expect(text).not.toContain(v1)
    expect(text).not.toMatch(/\/sessions\/|\/mnt\/|\/home\/|\/Users\//)
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })
})

describe('package-skills', () => {
  const out = mkdtempSync(join(tmpdir(), 'skills-'))
  afterAll(() => rmSync(out, { recursive: true, force: true }))

  it('writes one zip per skill, holding its folder, the same bytes every time', () => {
    const zips = packageSkills(SKILLS_DIR, out)
    expect(zips.map(z => z.slice(out.length + 1))).toEqual(skills.map(s => `${s}.zip`))
    for (const [i, zip] of zips.entries()) {
      const entries = unzipSync(readFileSync(zip))
      const skill = skills[i] as string
      expect(Object.keys(entries)).toEqual([`${skill}/SKILL.md`])
      expect(new TextDecoder().decode(entries[`${skill}/SKILL.md`])).toBe(read(skill))
    }
    const first = readFileSync(zips[0] as string)
    packageSkills(SKILLS_DIR, out)
    expect(readFileSync(zips[0] as string).equals(first)).toBe(true)
  })
})
