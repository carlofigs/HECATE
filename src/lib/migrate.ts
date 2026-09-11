/**
 * migrate.ts — schema versioning and forward-compatibility guard for data files
 *
 * Data files carry an optional `schemaVersion`. Files written before versioning
 * existed have no field at all, which is read as version 1 — the original shape.
 *
 * Every load passes through `migrateFile` before `validateFile`, so validation
 * and every component downstream only ever see the current shape.
 *
 * Three cases:
 *
 *   version === CURRENT   no-op
 *   version <  CURRENT    apply each registered migration in sequence
 *   version >  CURRENT    throw — see below
 *
 * The last case is the one that matters. Once more than one writer exists (the
 * app in two tabs, the calendar Action, an MCP server), a client running older
 * code can be handed a file written by a newer one. Loading it would mean
 * parsing a shape this build does not understand, and the next autosave would
 * write that misreading back — silently destroying whatever the newer writer
 * added. Refusing to load is the safe failure: the user sees an error telling
 * them to update, and the file is left intact.
 */

import type { DataFileName } from '@/lib/schemas'

/**
 * Bump when a data file's shape changes in a way older builds cannot read.
 * Additive optional fields do NOT need a bump — older builds ignore them safely.
 */
export const CURRENT_SCHEMA_VERSION = 1

/** Upgrades a file's raw JSON from version N to version N+1. */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/**
 * MIGRATIONS[fileName][n] upgrades that file from version n to n+1.
 *
 * Empty today: v1 is the original shape and nothing has changed yet. When a
 * shape does change, bump CURRENT_SCHEMA_VERSION and add the step that gets
 * the old shape to the new one. Steps run in order, so a v1 file reaching a
 * v3 build runs 1→2 then 2→3.
 */
const MIGRATIONS: Partial<Record<DataFileName, Record<number, Migration>>> = {}

/** Thrown when a file was written by a build newer than this one. */
export class FutureSchemaError extends Error {
  readonly fileVersion: number
  readonly supportedVersion: number

  constructor(name: DataFileName, fileVersion: number) {
    super(
      `${name}.json was written by a newer version of HECATE ` +
      `(schema v${fileVersion}; this build supports v${CURRENT_SCHEMA_VERSION}). ` +
      `Refresh to pick up the latest build. Not loading it, so nothing is overwritten.`,
    )
    this.name = 'FutureSchemaError'
    this.fileVersion = fileVersion
    this.supportedVersion = CURRENT_SCHEMA_VERSION
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Read a file's schema version. Anything missing, non-numeric, non-integer or
 * below 1 reads as version 1 — files predating versioning are exactly that
 * shape, and a corrupted field should not be trusted to mean something newer.
 */
export function readVersion(data: unknown): number {
  if (!isObject(data)) return CURRENT_SCHEMA_VERSION
  const v = data.schemaVersion
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 1
}

/**
 * Bring a parsed data file up to the current schema, stamping the version so
 * the next save carries it. Throws FutureSchemaError if the file is newer than
 * this build. Non-object input is returned untouched for validateFile to reject
 * with its own clearer message.
 */
export function migrateFile(name: DataFileName, data: unknown): unknown {
  if (!isObject(data)) return data

  const from = readVersion(data)
  if (from > CURRENT_SCHEMA_VERSION) throw new FutureSchemaError(name, from)

  let current = data
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[name]?.[v]
    if (!step) {
      throw new Error(
        `${name}.json is at schema v${v} and no migration to v${v + 1} is registered. ` +
        `This is a bug in migrate.ts, not a problem with your data.`,
      )
    }
    current = step(current)
  }

  return { ...current, schemaVersion: CURRENT_SCHEMA_VERSION }
}
