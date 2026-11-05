/**
 * cli.ts — `pnpm migrate-v1 --data <data repo checkout> [options]`
 *
 * Reads every v1 workspace in a data-repo checkout (each directory with a
 * tasks.json), prints the dry-run report, and writes the v2 trees only when
 * --out is given. Exits 1 if any workspace has an error or an unaccounted
 * field, 2 on a usage error.
 *
 *   --data <dir>        the data repo checkout (required)
 *   --config <file>     per-workspace settings (JSON; keep it outside this repo)
 *   --workspace <dir>   only this workspace (repeatable)
 *   --out <dir>         write <out>/<workspace>/… (refuses a non-empty target)
 *   --at <instant>      the migration time (default: now), for repeatable output
 *   --names             also list possible names left in sanitised text (stderr)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { migrateConfigSchema, resolveConfig, type MigrateConfig } from './config.ts'
import { migrateWorkspace } from './migrate.ts'
import { isReady, renderReport } from './report.ts'
import { V1_FILES, type V1Files } from './v1.ts'

export interface CliIO {
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** Where relative paths resolve from. */
  cwd: string
  now: () => string
}

const USAGE = 'Usage: pnpm migrate-v1 --data <dir> [--config <file>] [--workspace <dir>]… [--out <dir>] [--at <instant>] [--names]'

/** Workspace directories: those with a tasks.json, not hidden. */
export function findWorkspaces(dataDir: string): string[] {
  return readdirSync(dataDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && existsSync(join(dataDir, e.name, 'tasks.json')))
    .map(e => e.name)
    .sort()
}

function readWorkspace(dir: string): V1Files {
  const files: V1Files = {}
  for (const name of V1_FILES) {
    const path = join(dir, `${name}.json`)
    if (existsSync(path)) files[name] = readFileSync(path, 'utf8')
  }
  return files
}

export function main(argv: readonly string[], io: CliIO): number {
  let args
  try {
    args = parseArgs({
      args: [...argv],
      options: {
        data: { type: 'string' },
        config: { type: 'string' },
        workspace: { type: 'string', multiple: true },
        out: { type: 'string' },
        at: { type: 'string' },
        names: { type: 'boolean', default: false },
      },
      strict: true,
    }).values
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`)
    return 2
  }
  if (!args.data) {
    io.stderr(`--data is required.\n${USAGE}\n`)
    return 2
  }
  const dataDir = resolve(io.cwd, args.data)
  if (!existsSync(dataDir)) {
    io.stderr(`No such directory: ${args.data}\n`)
    return 2
  }

  let config: MigrateConfig = {}
  if (args.config) {
    const parsed = migrateConfigSchema.safeParse(JSON.parse(readFileSync(resolve(io.cwd, args.config), 'utf8')))
    if (!parsed.success) {
      io.stderr(`The config file is not valid:\n${parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')}\n`)
      return 2
    }
    config = parsed.data
  }

  const at = args.at ?? io.now()
  const all = findWorkspaces(dataDir)
  const selected = args.workspace ?? all
  const missing = selected.filter(w => !all.includes(w))
  if (missing.length > 0) {
    io.stderr(`Not a v1 workspace (no tasks.json): ${missing.join(', ')}\n`)
    return 2
  }
  const unknown = Object.keys(config.workspaces ?? {}).filter(w => !all.includes(w))
  if (unknown.length > 0) io.stderr(`Config names workspaces that are not in the data directory: ${unknown.join(', ')}\n`)

  let results
  try {
    results = selected.map(dir => ({ dir, ...migrateWorkspace(dir, readWorkspace(join(dataDir, dir)), resolveConfig(dir, config), { at }) }))
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  io.stdout(renderReport(results.map(r => r.report), { at }))

  if (args.names) {
    for (const r of results) {
      if (r.report.sanitised) io.stderr(`\nPossible names left in ${r.dir} (${r.possibleNames.length}):\n${r.possibleNames.map(n => `  ${n}`).join('\n')}\n`)
    }
  }

  const ready = results.every(r => isReady(r.report))
  if (args.out) {
    if (!ready) {
      io.stderr('\nNothing written: fix the errors above first.\n')
      return 1
    }
    const outDir = resolve(io.cwd, args.out)
    for (const r of results) {
      const target = join(outDir, r.dir)
      if (existsSync(target) && readdirSync(target).length > 0) {
        io.stderr(`\nNothing written: ${target} is not empty.\n`)
        return 1
      }
    }
    for (const r of results) {
      for (const [path, content] of Object.entries(r.files)) {
        const file = join(outDir, r.dir, path)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
      }
    }
    io.stderr(`\nWrote ${results.length} ${results.length === 1 ? 'workspace' : 'workspaces'} to ${args.out}\n`)
  }
  return ready ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2), {
    stdout: t => process.stdout.write(t),
    stderr: t => process.stderr.write(t),
    // pnpm runs package scripts from the package directory; INIT_CWD is where it was invoked.
    cwd: process.env.INIT_CWD ?? process.cwd(),
    now: () => new Date().toISOString(),
  })
}
