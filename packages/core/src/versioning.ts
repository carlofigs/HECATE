/**
 * versioning.ts — reading a file safely: version guard, migrations, validation.
 *
 * Every read goes migrate → validate. Three cases for a file's schemaVersion:
 *
 *   equal to CURRENT_VERSION   parse as is
 *   lower                      run each registered step in order, then parse
 *   higher                     refuse (FutureSchemaError)
 *
 * The last case is the safety property. Several writers share the data repo,
 * and one of them may be running an older build. Parsing a newer file would
 * fail validation at best; refusing it with a clear "update" message means the
 * file is never misread and never written back in an older shape.
 *
 * A file with no schemaVersion at all is a v1 HECATE file. v1 files are not
 * earlier versions of these kinds; they reach v2 only through migrate-v1.
 */

import { z } from 'zod'
import { CURRENT_VERSION, type FileKind } from './kinds.ts'
import { schemas, type FileData, type JsonFileKind } from './files.ts'

type JsonObject = Record<string, unknown>

/** Upgrades a kind's raw JSON from version n to n + 1. Pure. */
export type Migration = (raw: JsonObject) => JsonObject

/**
 * migrations[kind][n] upgrades that kind from version n to n + 1. Empty: every
 * kind is at version 1. When a shape changes, bump CURRENT_VERSION in kinds.ts
 * and register the step here; the completeness test fails until you do.
 */
export const migrations: { readonly [K in FileKind]: Readonly<Record<number, Migration>> } = {
  workspace: {},
  profile: {},
  tasks: {},
  focusWeek: {},
  keepInMind: {},
  project: {},
  sprint: {},
  people: {},
  glossary: {},
  activityEntry: {},
  meetingFrontmatter: {},
}

export class UnversionedFileError extends Error {
  readonly kind: FileKind
  constructor(kind: FileKind) {
    super(
      `This ${kind} file has no schemaVersion. It looks like a HECATE v1 file; ` +
      `v1 data reaches v2 only through migrate-v1. Not reading it, so nothing is overwritten.`,
    )
    this.name = 'UnversionedFileError'
    this.kind = kind
  }
}

export class FutureSchemaError extends Error {
  readonly kind: FileKind
  readonly fileVersion: number
  readonly supportedVersion: number
  constructor(kind: FileKind, fileVersion: number) {
    super(
      `This ${kind} file was written by a newer version of HECATE (schema v${fileVersion}; ` +
      `this build reads up to v${CURRENT_VERSION[kind]}). Update to the latest build. ` +
      `Not reading it, so nothing is overwritten.`,
    )
    this.name = 'FutureSchemaError'
    this.kind = kind
    this.fileVersion = fileVersion
    this.supportedVersion = CURRENT_VERSION[kind]
  }
}

export class FileValidationError extends Error {
  readonly kind: FileKind
  readonly issues: readonly z.core.$ZodIssue[]
  constructor(kind: FileKind, error: z.ZodError) {
    super(`Invalid ${kind} file:\n${z.prettifyError(error)}`)
    this.name = 'FileValidationError'
    this.kind = kind
    this.issues = error.issues
  }
}

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A file's schemaVersion. Throws UnversionedFileError if absent. */
export function readVersion(kind: FileKind, raw: JsonObject): number {
  if (!('schemaVersion' in raw)) throw new UnversionedFileError(kind)
  const v = raw.schemaVersion
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new RangeError(`This ${kind} file has an invalid schemaVersion: ${JSON.stringify(v)}`)
  }
  return v
}

/**
 * Bring raw JSON up to the current version of its kind. Non-objects pass
 * through untouched so validation reports them in its own words.
 */
export function migrate(kind: FileKind, raw: unknown): unknown {
  if (!isObject(raw)) return raw
  const from = readVersion(kind, raw)
  const current: number = CURRENT_VERSION[kind]
  if (from > current) throw new FutureSchemaError(kind, from)
  let data = raw
  for (let v = from; v < current; v++) {
    const step = migrations[kind][v]
    if (!step) {
      throw new Error(`No migration registered for ${kind} v${v} → v${v + 1}. This is a bug in @hecate/core, not in the data.`)
    }
    data = { ...step(data), schemaVersion: v + 1 }
  }
  return data
}

function schemaFor<K extends FileKind>(kind: K): z.ZodType<FileData<K>> {
  return schemas[kind] as unknown as z.ZodType<FileData<K>>
}

/** Migrate, then validate. Throws UnversionedFileError, FutureSchemaError or FileValidationError. */
export function parseFile<K extends FileKind>(kind: K, raw: unknown): FileData<K> {
  const result = schemaFor(kind).safeParse(migrate(kind, raw))
  if (!result.success) throw new FileValidationError(kind, result.error)
  return result.data
}

export type SafeParseResult<T> = { ok: true; data: T } | { ok: false; error: Error }

export function safeParseFile<K extends FileKind>(kind: K, raw: unknown): SafeParseResult<FileData<K>> {
  try {
    return { ok: true, data: parseFile(kind, raw) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

/** Add the current schemaVersion to new data and validate it. */
export function stamp<K extends FileKind>(kind: K, data: Omit<FileData<K>, 'schemaVersion'>): FileData<K> {
  return parseFile(kind, { schemaVersion: CURRENT_VERSION[kind], ...data })
}

function validateCurrent<K extends FileKind>(kind: K, data: unknown): FileData<K> {
  const result = schemaFor(kind).safeParse(data)
  if (!result.success) throw new FileValidationError(kind, result.error)
  return result.data
}

/**
 * The exact bytes to write for a JSON file: validated (never write a shape a
 * reader would refuse), keys in schema order, 2-space indent, trailing newline.
 */
export function serializeFile<K extends JsonFileKind>(kind: K, data: FileData<K>): string {
  return `${JSON.stringify(validateCurrent(kind, data), null, 2)}\n`
}

/** One validated activity entry as a JSONL line (with its newline), for appending. */
export function serializeActivityEntry(entry: FileData<'activityEntry'>): string {
  return `${JSON.stringify(validateCurrent('activityEntry', entry))}\n`
}

/** Parse a whole activity file. Blank lines are skipped; errors name the line. */
export function parseActivityLog(text: string): FileData<'activityEntry'>[] {
  const entries: FileData<'activityEntry'>[] = []
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      throw new SyntaxError(`Activity log line ${i + 1} is not valid JSON`)
    }
    try {
      entries.push(parseFile('activityEntry', raw))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Activity log line ${i + 1}: ${message}`, { cause: error })
    }
  })
  return entries
}
