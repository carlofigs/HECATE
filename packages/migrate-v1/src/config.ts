/**
 * config.ts — per-workspace settings v1 never stored: name, time zone,
 * policy, working days and sprint cadence (plus, for sanitised workspaces,
 * extra name → role replacements).
 *
 * The config file describes real workspaces, so it lives outside this
 * repository and is passed with --config. Without one, every workspace is
 * open, in UTC, Monday to Friday, with no sprints.
 */

import { z } from 'zod'
import { SprintSettings, isValidTimeZone, type FileData } from '@hecate/core'

const WorkspaceConfig = z.strictObject({
  name: z.string().min(1).optional(),
  timezone: z.string().refine(isValidTimeZone, 'Expected an IANA time zone, e.g. Australia/Sydney').optional(),
  policy: z.enum(['open', 'sanitised']).optional(),
  workdays: z.array(z.int().min(1).max(7)).min(1).max(7).optional(),
  sprint: SprintSettings.nullable().optional(),
  /** Sanitised workspaces: names v1 memory does not list, mapped to a role. */
  replacements: z.record(z.string(), z.string().min(1)).optional(),
})
export type WorkspaceConfig = z.infer<typeof WorkspaceConfig>

export const migrateConfigSchema = z.strictObject({
  /** Applied to every workspace, under its own entry. */
  defaults: WorkspaceConfig.optional(),
  /** Keyed by workspace directory name. */
  workspaces: z.record(z.string(), WorkspaceConfig).optional(),
})
export type MigrateConfig = z.infer<typeof migrateConfigSchema>

export interface ResolvedConfig {
  name: string
  timezone: string
  policy: 'open' | 'sanitised'
  workdays: number[]
  sprint: FileData<'workspace'>['sprint']
  replacements: Record<string, string>
  /** True when the config file had an entry for this workspace. */
  fromConfig: boolean
}

/** `_old_job` → `Old job`. */
function nameFromDir(dir: string): string {
  const words = dir.replace(/^[_.]+/, '').replace(/[_-]+/g, ' ').trim()
  return words === '' ? 'Workspace' : words.charAt(0).toUpperCase() + words.slice(1)
}

export function resolveConfig(dir: string, config: MigrateConfig = {}): ResolvedConfig {
  const own = config.workspaces?.[dir]
  const merged = { ...config.defaults, ...own }
  return {
    name: merged.name ?? nameFromDir(dir),
    timezone: merged.timezone ?? 'UTC',
    policy: merged.policy ?? 'open',
    workdays: merged.workdays ?? [1, 2, 3, 4, 5],
    sprint: merged.sprint ?? null,
    replacements: { ...config.defaults?.replacements, ...own?.replacements },
    fromConfig: own !== undefined,
  }
}
