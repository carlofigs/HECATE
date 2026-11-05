/**
 * package-skills.ts — one zip per skill, for uploading to claude.ai
 * (Settings → Capabilities → Skills), which Cowork also uses:
 *
 *   pnpm package-skills        → plugin/dist/<skill>.zip
 *
 * Each zip holds the skill's folder (`<skill>/SKILL.md` and anything beside
 * it), which is the layout claude.ai expects. Claude Code installs the same
 * skills as a plugin instead (plugin/README.md).
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'

const files = (dir: string): string[] =>
  readdirSync(dir).sort().flatMap(name => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))

/** Write `<outDir>/<skill>.zip` for every skill folder in `skillsDir`; returns the zip paths. */
export function packageSkills(skillsDir: string, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true })
  return readdirSync(skillsDir).sort().filter(name => statSync(join(skillsDir, name)).isDirectory()).map(skill => {
    const entries: Record<string, Uint8Array> = {}
    for (const file of files(join(skillsDir, skill))) entries[`${skill}/${relative(join(skillsDir, skill), file).split('\\').join('/')}`] = readFileSync(file)
    // A fixed timestamp, so the same skill always makes the same bytes.
    const zip = zipSync(entries, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') })
    const path = join(outDir, `${skill}.zip`)
    writeFileSync(path, zip)
    return path
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = new URL('..', import.meta.url).pathname
  for (const path of packageSkills(join(root, 'skills'), join(root, 'dist'))) process.stdout.write(`${relative(process.cwd(), path)}\n`)
}
